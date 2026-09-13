import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { toTicketDto } from "./mappers.js";
import { PatchTicketFieldsBodySchema, TicketSchema, UuidIdParamSchema } from "./schema.js";

/** Route 26 — PATCH /tickets/:id/fields: final (client-facing) output fields.
 * Working metadata is PATCH /tickets/:id (routes.ts); AI proposals merge into
 * this same surface (C4). tlp defaults AMBER at create; patches set it explicitly. */
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
      const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
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
      if (request.body.tlp !== undefined) {
        data.tlp = request.body.tlp;
      }
      const updated = await prisma.ticket.update({ where: { id }, data });
      return toTicketDto(updated);
    },
  );
}
