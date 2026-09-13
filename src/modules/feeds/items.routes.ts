import type { Prisma } from "../../generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "../../lib/db.js";
import { toFeedItemWire } from "./map.js";
import { ListFeedItemsQuerySchema, ListFeedItemsResponseSchema } from "./schema.js";

/** The file lives in feeds/ but serves the contract's root-level /feed-items. */
export const prefixOverride = "/feed-items";

// Autoload prefix override above, so "/" here resolves to GET /feed-items.
export default async function feedItemRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/",
    {
      schema: {
        querystring: ListFeedItemsQuerySchema,
        response: { 200: ListFeedItemsResponseSchema },
      },
    },
    async (request) => {
      const { page, pageSize, status, feedSourceId, q, from, to } = request.query;
      const where: Prisma.FeedItemWhereInput = {};
      if (status !== undefined) {
        where.status = status;
      }
      if (feedSourceId !== undefined) {
        where.feedId = feedSourceId;
      }
      if (q !== undefined) {
        where.title = { contains: q, mode: "insensitive" };
      }
      if (from !== undefined || to !== undefined) {
        where.publishedAt = {
          ...(from === undefined ? {} : { gte: from }),
          ...(to === undefined ? {} : { lte: to }),
        };
      }
      const [rows, total] = await prisma.$transaction([
        prisma.feedItem.findMany({
          where,
          include: { ticket: { select: { id: true } } },
          orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.feedItem.count({ where }),
      ]);
      return { items: rows.map(toFeedItemWire), total, page, pageSize };
    },
  );
}
