import type { FastifyInstance } from "fastify";
import type { Prisma } from "../../generated/prisma/client.js";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { recordActivity } from "./activity.js";
import { toTicketSourceDto } from "./mappers.js";
import {
  CreateTicketSourceBodySchema,
  SourceIdParamSchema,
  TicketSourceSchema,
  UpdateTicketSourceBodySchema,
  UuidIdParamSchema,
} from "./schema.js";

/** Routes 27, 27a, 28 — POST/PATCH/DELETE under /tickets/:id/sources (WORK). */
export default async function ticketSourceRoutes(app: FastifyInstance): Promise<void> {
  const routeApp = app.withTypeProvider<ZodTypeProvider>();

  routeApp.post(
    "/:id/sources",
    {
      schema: {
        params: UuidIdParamSchema,
        body: CreateTicketSourceBodySchema,
        response: { 201: TicketSourceSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request, reply) => {
      const { id } = request.params;
      const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
      if (ticket === null) {
        throw new AppError("NOT_FOUND", `Ticket ${id} not found`);
      }
      const body = request.body;
      const actorId = request.user.sub;
      const created = await prisma.$transaction(async (tx) => {
        const created = await tx.ticketSource.create({
          data: {
            ticketId: id,
            ...(body.url !== undefined ? { url: body.url } : {}),
            ...(body.note !== undefined ? { note: body.note } : {}),
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {}),
            createdById: actorId,
          },
        });
        await recordActivity(tx, {
          ticketId: id,
          actorId,
          action: "SOURCE_ADDED",
          detail: sourceLabel(created),
        });
        return created;
      });
      return reply.code(201).send(toTicketSourceDto(created));
    },
  );

  routeApp.patch(
    "/:id/sources/:sourceId",
    {
      schema: {
        params: SourceIdParamSchema,
        body: UpdateTicketSourceBodySchema,
        response: { 200: TicketSourceSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { id, sourceId } = request.params;
      const existing = await prisma.ticketSource.findFirst({
        where: { id: sourceId, ticketId: id },
        select: { id: true },
      });
      if (existing === null) {
        throw new AppError("NOT_FOUND", `Source ${sourceId} not found on ticket ${id}`);
      }
      const data: Prisma.TicketSourceUncheckedUpdateInput = {};
      if (request.body.url !== undefined) data.url = request.body.url;
      if (request.body.note !== undefined) data.note = request.body.note;
      if (request.body.title !== undefined) data.title = request.body.title;
      if (request.body.notes !== undefined) data.notes = request.body.notes;
      const actorId = request.user.sub;
      const updated = await prisma.$transaction(async (tx) => {
        const updated = await tx.ticketSource.update({ where: { id: sourceId }, data });
        await recordActivity(tx, {
          ticketId: id,
          actorId,
          action: "SOURCE_UPDATED",
          detail: sourceLabel(updated),
        });
        return updated;
      });
      return toTicketSourceDto(updated);
    },
  );

  routeApp.delete(
    "/:id/sources/:sourceId",
    {
      schema: { params: SourceIdParamSchema },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request, reply) => {
      const { id, sourceId } = request.params;
      const existing = await prisma.ticketSource.findFirst({
        where: { id: sourceId, ticketId: id },
        select: { url: true, note: true, title: true, notes: true },
      });
      if (existing === null) {
        throw new AppError("NOT_FOUND", `Source ${sourceId} not found on ticket ${id}`);
      }
      await prisma.$transaction(async (tx) => {
        await tx.ticketSource.deleteMany({ where: { id: sourceId, ticketId: id } });
        await recordActivity(tx, {
          ticketId: id,
          actorId: request.user.sub,
          action: "SOURCE_REMOVED",
          detail: sourceLabel(existing),
        });
      });
      return reply.code(204).send();
    },
  );
}

/** Short activity-feed label: title, else url, else note, else notes head. */
function sourceLabel(source: TicketSourceRow): string {
  return source.title ?? source.url ?? source.note ?? source.notes?.slice(0, 80) ?? "";
}

type TicketSourceRow = {
  title: string | null;
  url: string | null;
  note: string | null;
  notes: string | null;
};
