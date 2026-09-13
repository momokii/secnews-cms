import { Prisma } from "../../generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { sendError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { encodeChannelTarget, toChannelWire } from "../channels/map.js";
import { ChannelSchema, CreateChannelBodySchema } from "../channels/schema.js";
import { toClientWire } from "./map.js";
import {
  ClientIdParamSchema,
  CreateClientBodySchema,
  ClientSchema,
  ListClientsQuerySchema,
  ListClientsResponseSchema,
  UuidIdParamSchema,
  UpdateClientBodySchema,
} from "./schema.js";

/** Surface 6 — clients (#40–43) plus channel creation (#44). Read: ANY role
 * (send-dialog context); mutations: MGR. Deleting a client that still owns
 * channels is a FK violation → 409 CONFLICT. */

function prismaErrorToReply(reply: Parameters<typeof sendError>[0], err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return sendError(reply, "NOT_FOUND", "Unknown resource id");
    if (err.code === "P2003") return sendError(reply, "CONFLICT", "Resource is still referenced");
  }
  throw err;
}

// Autoload prefixes the module directory, so "/" here resolves to /clients.
export default async function clientRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();
  const mgr = [app.requireRole("ADMIN", "EDITOR")];

  f.get(
    "/",
    {
      schema: {
        querystring: ListClientsQuerySchema,
        response: { 200: ListClientsResponseSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { q, page, pageSize } = request.query;
      const where: Prisma.ClientWhereInput = {};
      if (q !== undefined) {
        where.name = { contains: q, mode: "insensitive" };
      }
      const [rows, total] = await prisma.$transaction([
        prisma.client.findMany({
          where,
          orderBy: { createdAt: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.client.count({ where }),
      ]);
      return { items: rows.map(toClientWire), total, page, pageSize };
    },
  );

  f.post(
    "/",
    { schema: { body: CreateClientBodySchema, response: { 201: ClientSchema } }, onRequest: mgr },
    async (request, reply) => {
      const client = await prisma.client.create({ data: { name: request.body.name } });
      return reply.code(201).send(toClientWire(client));
    },
  );

  f.patch(
    "/:id",
    {
      schema: {
        params: UuidIdParamSchema,
        body: UpdateClientBodySchema,
        response: { 200: ClientSchema },
      },
      onRequest: mgr,
    },
    async (request, reply) => {
      const { name, active } = request.body;
      const data = {
        ...(name === undefined ? {} : { name }),
        ...(active === undefined ? {} : { isActive: active }),
      };
      try {
        const client = await prisma.client.update({ where: { id: request.params.id }, data });
        return toClientWire(client);
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
        await prisma.client.delete({ where: { id: request.params.id } });
        return reply.code(204).send();
      } catch (err) {
        return prismaErrorToReply(reply, err);
      }
    },
  );

  f.post(
    "/:clientId/channels",
    {
      schema: {
        params: ClientIdParamSchema,
        body: CreateChannelBodySchema,
        response: { 201: ChannelSchema },
      },
      onRequest: mgr,
    },
    async (request, reply) => {
      try {
        const channel = await prisma.channel.create({
          data: {
            clientId: request.params.clientId,
            type: request.body.type,
            target: encodeChannelTarget(request.body),
          },
        });
        return reply.code(201).send(toChannelWire(channel));
      } catch (err) {
        return prismaErrorToReply(reply, err);
      }
    },
  );
}
