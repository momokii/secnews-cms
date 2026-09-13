import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
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
      const created = await prisma.ticketSource.create({
        data: {
          ticketId: id,
          ...(request.body.url !== undefined ? { url: request.body.url } : {}),
          ...(request.body.note !== undefined ? { note: request.body.note } : {}),
          createdById: request.user.sub,
        },
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
      const removed = await prisma.ticketSource.deleteMany({
        where: { id: sourceId, ticketId: id },
      });
      if (removed.count === 0) {
        throw new AppError("NOT_FOUND", `Source ${sourceId} not found on ticket ${id}`);
      }
      return reply.code(204).send();
    },
  );
}
