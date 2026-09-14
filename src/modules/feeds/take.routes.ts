import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { UuidIdParamSchema } from "./schema.js";
import { toTicketDto } from "../tickets/mappers.js";
import { takeFeedItem } from "../tickets/take.js";
import { TicketSchema } from "../tickets/schema.js";

/** Route 19 — lives in feeds/ but serves the contract's /feed-items/:id/take.
 * The claim→ticket transaction itself is the tickets module's take.ts. */
export const prefixOverride = "/feed-items";

export default async function feedItemTakeRoutes(app: FastifyInstance): Promise<void> {
  const routeApp = app.withTypeProvider<ZodTypeProvider>();

  routeApp.post(
    "/:id/take",
    {
      schema: { params: UuidIdParamSchema, response: { 201: TicketSchema } },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request, reply) => {
      const ticket = await takeFeedItem(request.params.id, request.user.sub);
      return reply.code(201).send(toTicketDto(ticket));
    },
  );
}
