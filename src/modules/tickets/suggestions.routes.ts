import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import type { Prisma } from "../../generated/prisma/client.js";
import { SuggestionStatus } from "../../generated/prisma/enums.js";
import { AppError } from "../../common/errors.js";
import { idParam } from "../../common/pagination.js";
import { recordActivity } from "./activity.js";
import {
  ListSuggestionsQuerySchema,
  ListSuggestionsResponseSchema,
  SuggestionActionResponseSchema,
} from "../ai/schema.js";
import { SUGGESTIBLE_FIELDS, toSuggestion, type SuggestibleField } from "../ai/service.js";
import { findInvalidCveIds } from "./validation.js";

/**
 * Suggestion lifecycle (Surface 4, #34/#35/#36). accept merges the suggested
 * value into the ticket's final fields and marks the row ACCEPTED (SUG-01);
 * reject only flips the status (SUG-02). Both are single-action: acting on a
 * resolved suggestion is a 409 CONFLICT.
 */

const listParams = idParam;

const actionParams = z.object({
  id: z.uuid(),
  suggestionId: z.uuid(),
});

const deleteParams = z.object({ id: z.uuid() });

function toList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function mergeFor(field: SuggestibleField, value: string): Prisma.TicketUpdateInput {
  switch (field) {
    case "overview":
      return { overview: value };
    case "description":
      return { description: value };
    case "recommendations":
      return { recommendations: value };
    case "mitigation":
      return { mitigation: value };
    case "affectedVersions":
      return { affectedVersions: value };
    case "references":
      return { references: toList(value) };
    case "cveIds":
      return { cveIds: toList(value) };
  }
}

function parseSuggestion(row: { content: string }): { field: SuggestibleField; suggestedValue: string } {
  const payload = JSON.parse(row.content) as { field?: unknown; suggestedValue?: unknown };
  const field = SUGGESTIBLE_FIELDS.find((candidate) => candidate === payload.field);
  if (field === undefined || typeof payload.suggestedValue !== "string") {
    throw new AppError("VALIDATION", "Suggestion payload does not reference a mergeable final field");
  }
  return { field, suggestedValue: payload.suggestedValue };
}

/** Activity detail JSON {field, value≤500, decision} — the value is capped
 * so the audit trail never balloons on long rewrites. */
function decisionDetail(field: string, value: string, decision: "ACCEPTED" | "REJECTED" | "deleted"): string {
  return JSON.stringify({ field, value: value.slice(0, 500), decision });
}

export default async function suggestionRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();
  const work = app.requireRole("ADMIN", "EDITOR", "ANALYST");

  // GET /tickets/:id/suggestions?status&page&pageSize
  f.get("/:id/suggestions", {
    onRequest: [work],
    schema: {
      params: listParams,
      querystring: ListSuggestionsQuerySchema,
      response: { 200: ListSuggestionsResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params;
    const { status, page, pageSize } = request.query;
    const where = { ticketId: id, ...(status === undefined ? {} : { status }) };
    const [rows, total] = await Promise.all([
      app.prisma.aiSuggestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      app.prisma.aiSuggestion.count({ where }),
    ]);
    return { items: rows.map(toSuggestion), total, page, pageSize };
  });

  // POST /tickets/:id/suggestions/:suggestionId/accept — merge into final fields.
  f.post("/:id/suggestions/:suggestionId/accept", {
    onRequest: [work],
    schema: {
      params: actionParams,
      response: { 200: SuggestionActionResponseSchema },
    },
  }, async (request) => {
    const { id, suggestionId } = request.params;
    const row = await app.prisma.aiSuggestion.findFirst({ where: { id: suggestionId, ticketId: id } });
    if (row === null) {
      throw new AppError("NOT_FOUND", "Suggestion not found for this ticket");
    }
    if (row.status !== SuggestionStatus.PENDING) {
      throw new AppError("CONFLICT", `Suggestion already ${row.status.toLowerCase()}`);
    }
    const { field, suggestedValue } = parseSuggestion(row);
    // Incident guard: an accepted cveIds suggestion with garbage entries once
    // 500'd every tickets read. Validate BEFORE any write — the suggestion
    // stays PENDING so the analyst can edit the fields manually or reject.
    if (field === "cveIds") {
      const invalid = findInvalidCveIds(toList(suggestedValue));
      if (invalid.length > 0) {
        throw new AppError(
          "VALIDATION",
          `Suggestion not accepted: cveIds contains invalid CVE id(s) ${invalid.join(", ")} ` +
            "(expected CVE-YYYY-NNNNN) — edit the ticket fields manually or reject the suggestion",
          { field, invalid },
          422,
        );
      }
    }
    const actorId = request.user.sub;
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id }, data: mergeFor(field, suggestedValue) });
      const updated = await tx.aiSuggestion.update({
        where: { id: suggestionId },
        data: { status: SuggestionStatus.ACCEPTED },
      });
      await recordActivity(tx, {
        ticketId: id,
        actorId,
        action: "SUGGESTION_ACCEPTED",
        detail: decisionDetail(field, suggestedValue, "ACCEPTED"),
      });
      return updated;
    });
    return { suggestion: toSuggestion(updated) };
  });

  // POST /tickets/:id/suggestions/:suggestionId/reject — status flip only.
  f.post("/:id/suggestions/:suggestionId/reject", {
    onRequest: [work],
    schema: {
      params: actionParams,
      response: { 200: SuggestionActionResponseSchema },
    },
  }, async (request) => {
    const { id, suggestionId } = request.params;
    const row = await app.prisma.aiSuggestion.findFirst({ where: { id: suggestionId, ticketId: id } });
    if (row === null) {
      throw new AppError("NOT_FOUND", "Suggestion not found for this ticket");
    }
    if (row.status !== SuggestionStatus.PENDING) {
      throw new AppError("CONFLICT", `Suggestion already ${row.status.toLowerCase()}`);
    }
    // Lenient read: reject must always work, even on rows whose payload the
    // stricter accept-side parser would refuse.
    const payload = JSON.parse(row.content) as { field?: unknown; suggestedValue?: unknown };
    const field = typeof payload.field === "string" ? payload.field : "";
    const suggestedValue = typeof payload.suggestedValue === "string" ? payload.suggestedValue : "";
    const actorId = request.user.sub;
    const updated = await app.prisma.$transaction(async (tx) => {
      const updated = await tx.aiSuggestion.update({
        where: { id: suggestionId },
        data: { status: SuggestionStatus.REJECTED },
      });
      await recordActivity(tx, {
        ticketId: id,
        actorId,
        action: "SUGGESTION_REJECTED",
        detail: decisionDetail(field, suggestedValue, "REJECTED"),
      });
      return updated;
    });
    return { suggestion: toSuggestion(updated) };
  });

  // DELETE /tickets/suggestions/:id — discard a suggestion row (204).
  // Every status is deletable cleanup (PENDING, REJECTED and ACCEPTED alike).
  // Deletion removes ONLY the suggestion row: a value already merged into the
  // ticket by accept is never reverted, and the SUGGESTION_DELETED entry is
  // appended — earlier decision rows are never rewritten (history is
  // append-only), so a rejected-then-deleted suggestion keeps its REJECTED
  // entry alongside the delete marker.
  f.delete("/suggestions/:id", {
    onRequest: [work],
    schema: {
      params: deleteParams,
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const row = await app.prisma.aiSuggestion.findUnique({ where: { id } });
    if (row === null) {
      throw new AppError("NOT_FOUND", "Suggestion not found");
    }
    const payload = JSON.parse(row.content) as { field?: unknown; suggestedValue?: unknown };
    const field = typeof payload.field === "string" ? payload.field : "";
    const suggestedValue = typeof payload.suggestedValue === "string" ? payload.suggestedValue : "";
    await app.prisma.$transaction(async (tx) => {
      await tx.aiSuggestion.delete({ where: { id } });
      await recordActivity(tx, {
        ticketId: row.ticketId,
        actorId: request.user.sub,
        action: "SUGGESTION_DELETED",
        detail: decisionDetail(field, suggestedValue, "deleted"),
      });
    });
    return reply.code(204).send();
  });
}
