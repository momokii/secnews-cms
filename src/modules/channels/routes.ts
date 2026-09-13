import { Prisma } from "../../generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { sendError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { applyChannelUpdate, toChannelWire } from "./map.js";
import { ChannelSchema, UuidIdParamSchema, UpdateChannelBodySchema } from "./schema.js";

/** Surface 6 — channel mutations (#45–46), MGR only. Channel creation lives
 * under POST /clients/:clientId/channels (clients module); this file serves
 * the root-level /channels/:id PATCH and DELETE. */

function prismaErrorToReply(reply: Parameters<typeof sendError>[0], err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return sendError(reply, "NOT_FOUND", "Unknown resource id");
    if (err.code === "P2003") return sendError(reply, "CONFLICT", "Resource is still referenced");
  }
  throw err;
}

export default async function channelRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();
  const mgr = [app.requireRole("ADMIN", "EDITOR")];

  f.patch(
    "/:id",
    {
      schema: {
        params: UuidIdParamSchema,
        body: UpdateChannelBodySchema,
        response: { 200: ChannelSchema },
      },
      onRequest: mgr,
    },
    async (request, reply) => {
      try {
        const row = await prisma.channel.findUnique({ where: { id: request.params.id } });
        if (row === null) {
          return sendError(reply, "NOT_FOUND", "Unknown resource id");
        }
        const data = applyChannelUpdate(row, request.body);
        const updated = await prisma.channel.update({ where: { id: row.id }, data });
        return toChannelWire(updated);
      } catch (err) {
        return prismaErrorToReply(reply, err);
      }
    },
  );

  f.delete(
    "/:id",
    { schema: { params: UuidIdParamSchema }, onRequest: mgr },
    async (request, reply) => {
      try {
        await prisma.channel.delete({ where: { id: request.params.id } });
        return reply.code(204).send();
      } catch (err) {
        return prismaErrorToReply(reply, err);
      }
    },
  );
}
