import { Prisma } from "../../generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { sendError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { toFeedSourceWire } from "./map.js";
import {
  CreateFeedBodySchema,
  FeedSourceSchema,
  ListFeedSourcesQuerySchema,
  ListFeedSourcesResponseSchema,
  UpdateFeedBodySchema,
  UuidIdParamSchema,
} from "./schema.js";

/** Maps prisma known request errors onto the canonical error codes:
 * unique violation → 409 CONFLICT, missing row → 404 NOT_FOUND,
 * FK violation (source still has items) → 409 CONFLICT. */
function prismaErrorToReply(reply: Parameters<typeof sendError>[0], err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return sendError(reply, "CONFLICT", "Resource already exists");
    if (err.code === "P2025") return sendError(reply, "NOT_FOUND", "Unknown resource id");
    if (err.code === "P2003") return sendError(reply, "CONFLICT", "Resource is still referenced");
  }
  throw err;
}

// Autoload prefixes the module directory, so "/" here resolves to /feeds.
export default async function feedRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/",
    {
      schema: {
        querystring: ListFeedSourcesQuerySchema,
        response: { 200: ListFeedSourcesResponseSchema },
      },
    },
    async (request) => {
      const { page, pageSize } = request.query;
      const [sources, total] = await prisma.$transaction([
        prisma.feedSource.findMany({
          orderBy: { createdAt: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.feedSource.count(),
      ]);
      return { items: sources.map(toFeedSourceWire), total, page, pageSize };
    },
  );

  f.post(
    "/",
    { schema: { body: CreateFeedBodySchema, response: { 201: FeedSourceSchema } } },
    async (request, reply) => {
      try {
        const { name, url, active } = request.body;
        const source = await prisma.feedSource.create({
          data: { name, url, isActive: active },
        });
        return reply.code(201).send(toFeedSourceWire(source));
      } catch (err) {
        return prismaErrorToReply(reply, err);
      }
    },
  );

  f.patch(
    "/:id",
    {
      schema: {
        params: UuidIdParamSchema,
        body: UpdateFeedBodySchema,
        response: { 200: FeedSourceSchema },
      },
    },
    async (request, reply) => {
      const { name, url, active } = request.body;
      const data = {
        ...(name === undefined ? {} : { name }),
        ...(url === undefined ? {} : { url }),
        ...(active === undefined ? {} : { isActive: active }),
      };
      try {
        const source = await prisma.feedSource.update({
          where: { id: request.params.id },
          data,
        });
        return toFeedSourceWire(source);
      } catch (err) {
        return prismaErrorToReply(reply, err);
      }
    },
  );

  f.delete(
    "/:id",
    { schema: { params: UuidIdParamSchema } },
    async (request, reply) => {
      try {
        await prisma.feedSource.delete({ where: { id: request.params.id } });
        return reply.code(204).send();
      } catch (err) {
        return prismaErrorToReply(reply, err);
      }
    },
  );
}
