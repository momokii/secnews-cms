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
        detail: field,
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
      });
      return updated;
    });
    return { suggestion: toSuggestion(updated) };
  });
}
