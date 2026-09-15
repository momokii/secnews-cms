import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { recordActivity } from "./activity.js";
import { toTicketDto } from "./mappers.js";
import { PatchTicketFieldsBodySchema, TicketSchema, UuidIdParamSchema } from "./schema.js";
import { assertValidCveIds } from "./validation.js";

/** Route 26 — PATCH /tickets/:id/fields: final (client-facing) output fields.
 * Working metadata is PATCH /tickets/:id (routes.ts); AI proposals merge into
 * this same surface (C4). tlp defaults AMBER at create; patches set it explicitly. */

const DETAIL_FIELDS = [
  "title",
  "overview",
  "description",
  "recommendations",
  "references",
  "cveIds",
  "tlp",
] as const;

type FieldSnapshot = Prisma.TicketGetPayload<{
  select: {
    title: true;
    overview: true;
    description: true;
    recommendations: true;
    references: true;
    cveIds: true;
    tlp: true;
  };
}>;

const DETAIL_VALUE_LIMIT = 500;

/** Text values capped so the audit row cannot balloon; arrays join into text. */
function detailValue(value: string | string[] | null): string | null {
  if (value === null) {
    return null;
  }
  const text = Array.isArray(value) ? value.join(", ") : value;
  return text.length > DETAIL_VALUE_LIMIT ? text.slice(0, DETAIL_VALUE_LIMIT) : text;
}

/** JSON `{field:{from,to}}` for fields whose value actually changed;
 * null when the patch was a no-op. */
function fieldsDetail(before: FieldSnapshot, after: FieldSnapshot): string | null {
  const changes: Record<string, { from: string | null; to: string | null }> = {};
  for (const field of DETAIL_FIELDS) {
    const oldValue = before[field];
    const newValue = after[field];
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      continue;
    }
    changes[field] = { from: detailValue(oldValue), to: detailValue(newValue) };
  }
  return Object.keys(changes).length === 0 ? null : JSON.stringify(changes);
}

export async function registerFieldsRoute(app: FastifyInstance): Promise<void> {
  const routeApp = app.withTypeProvider<ZodTypeProvider>();

  routeApp.patch(
    "/:id/fields",
    {
      schema: {
        params: UuidIdParamSchema,
        body: PatchTicketFieldsBodySchema,
        response: { 200: TicketSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { id } = request.params;
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          overview: true,
          description: true,
          recommendations: true,
          references: true,
          cveIds: true,
          tlp: true,
        },
      });
      if (ticket === null) {
        throw new AppError("NOT_FOUND", `Ticket ${id} not found`);
      }
      const data: Prisma.TicketUpdateInput = {};
      if (request.body.title !== undefined) {
        data.title = request.body.title;
      }
      if (request.body.overview !== undefined) {
        data.overview = request.body.overview;
      }
      if (request.body.description !== undefined) {
        data.description = request.body.description;
      }
      if (request.body.recommendations !== undefined) {
        data.recommendations = request.body.recommendations;
      }
      if (request.body.references !== undefined) {
        data.references = request.body.references;
      }
      if (request.body.cveIds !== undefined) {
        assertValidCveIds(request.body.cveIds);
        data.cveIds = request.body.cveIds;
      }
      if (request.body.tlp !== undefined) {
        data.tlp = request.body.tlp;
      }
      const actorId = request.user.sub;
      const updated = await prisma.$transaction(async (tx) => {
        const updated = await tx.ticket.update({ where: { id }, data });
        await recordActivity(tx, {
          ticketId: id,
          actorId,
          action: "FIELDS_UPDATED",
          detail: fieldsDetail(ticket, updated),
        });
        return updated;
      });
      return toTicketDto(updated);
    },
  );
}
