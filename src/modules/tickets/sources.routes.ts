import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { recordActivity } from "./activity.js";
import { toTicketSourceDto } from "./mappers.js";
import {
  CreateTicketSourceBodySchema,
  SourceIdParamSchema,
  TicketSourceSchema,
  UuidIdParamSchema,
} from "./schema.js";

/** Routes 27–28 — POST/DELETE under /tickets/:id/sources (WORK). */
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
      const actorId = request.user.sub;
      const sourceLabel = request.body.url ?? request.body.note ?? "";
      const created = await prisma.$transaction(async (tx) => {
        const created = await tx.ticketSource.create({
          data: {
            ticketId: id,
            ...(request.body.url !== undefined ? { url: request.body.url } : {}),
            ...(request.body.note !== undefined ? { note: request.body.note } : {}),
            createdById: actorId,
          },
        });
        await recordActivity(tx, {
          ticketId: id,
          actorId,
          action: "SOURCE_ADDED",
          detail: sourceLabel,
        });
        return created;
      });
      return reply.code(201).send(toTicketSourceDto(created));
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
        select: { url: true, note: true },
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
          detail: existing.url ?? existing.note ?? "",
        });
      });
      return reply.code(204).send();
    },
  );
}
