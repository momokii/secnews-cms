import type { Prisma } from "../../generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { toFeedItemWire } from "./map.js";
import {
  FeedItemDetailSchema,
  FeedItemSchema,
  ListFeedItemsQuerySchema,
  ListFeedItemsResponseSchema,
  UuidIdParamSchema,
} from "./schema.js";

/** The file lives in feeds/ but serves the contract's root-level /feed-items:
 * #16 list (ANY), #17 detail (ANY, verbatim raw), #18 view (WORK, VIEWED
 * transition; 409 CONFLICT once TAKEN). */
export const prefixOverride = "/feed-items";

const anyRole = (app: FastifyInstance) => [app.requireRole("ADMIN", "EDITOR", "ANALYST")];

export default async function feedItemRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/",
    {
      schema: {
        querystring: ListFeedItemsQuerySchema,
        response: { 200: ListFeedItemsResponseSchema },
      },
      onRequest: anyRole(app),
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

  f.get(
    "/:id",
    {
      schema: {
        params: UuidIdParamSchema,
        response: { 200: FeedItemDetailSchema },
      },
      onRequest: anyRole(app),
    },
    async (request) => {
      const item = await prisma.feedItem.findUnique({
        where: { id: request.params.id },
        include: { feed: { select: { name: true } }, ticket: { select: { id: true } } },
      });
      if (item === null) {
        throw new AppError("NOT_FOUND", `Feed item ${request.params.id} not found`);
      }
      return { ...toFeedItemWire(item), sourceName: item.feed.name, raw: item.raw };
    },
  );

  f.post(
    "/:id/view",
    {
      schema: {
        params: UuidIdParamSchema,
        response: { 200: FeedItemSchema },
      },
      onRequest: anyRole(app),
    },
    async (request) => {
      const item = await prisma.feedItem.findUnique({ where: { id: request.params.id } });
      if (item === null) {
        throw new AppError("NOT_FOUND", `Feed item ${request.params.id} not found`);
      }
      if (item.status === "TAKEN") {
        throw new AppError("CONFLICT", "Feed item is already TAKEN", { status: item.status }, 409);
      }
      const viewed = await prisma.feedItem.update({
        where: { id: item.id },
        data: { status: "VIEWED" },
        include: { ticket: { select: { id: true } } },
      });
      return toFeedItemWire(viewed);
    },
  );
}
