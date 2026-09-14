import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { recordActivity } from "./activity.js";
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
      const changedFieldNames: string[] = [];
      if (request.body.title !== undefined) {
        data.title = request.body.title;
        changedFieldNames.push("title");
      }
      if (request.body.overview !== undefined) {
        data.overview = request.body.overview;
        changedFieldNames.push("overview");
      }
      if (request.body.description !== undefined) {
        data.description = request.body.description;
        changedFieldNames.push("description");
      }
      if (request.body.recommendations !== undefined) {
        data.recommendations = request.body.recommendations;
        changedFieldNames.push("recommendations");
      }
      if (request.body.references !== undefined) {
        data.references = request.body.references;
        changedFieldNames.push("references");
      }
      if (request.body.tlp !== undefined) {
        data.tlp = request.body.tlp;
        changedFieldNames.push("tlp");
      }
      const actorId = request.user.sub;
      const updated = await prisma.$transaction(async (tx) => {
        const updated = await tx.ticket.update({ where: { id }, data });
        await recordActivity(tx, {
          ticketId: id,
          actorId,
          action: "FIELDS_UPDATED",
          detail: changedFieldNames.join(", "),
        });
        return updated;
      });
      return toTicketDto(updated);
    },
  );
}
