import { z } from "zod/v4";
import { FeedItemStatus as PrismaFeedItemStatus } from "../../generated/prisma/enums.js";
import { paginated, pageQuery } from "../../common/pagination.js";

/** Feed sources + triage inbox. Source management = ADMIN/EDITOR;
 * item triage (list/detail/view/take) = any authenticated role. */

/** Triage states. TAKEN is terminal (the spawned ticket owns the content). */
export const FeedItemStatusEnum = z.enum(PrismaFeedItemStatus);
export type FeedItemStatus = z.infer<typeof FeedItemStatusEnum>;

export const FeedSourceSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  url: z.url(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type FeedSource = z.infer<typeof FeedSourceSchema>;

// POST /feeds
export const CreateFeedBodySchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  active: z.boolean().default(true),
});

// PATCH /feeds/:id
export const UpdateFeedBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    url: z.url().optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field required" });

// GET /feeds
export const ListFeedSourcesQuerySchema = pageQuery;
export const ListFeedSourcesResponseSchema = paginated(FeedSourceSchema);

/** Feed ids are uuid strings (prisma defaults), not the int idParam variant. */
export const UuidIdParamSchema = z.object({ id: z.uuid() });

export const FeedItemSchema = z.object({
  id: z.uuid(),
  feedSourceId: z.uuid(),
  guid: z.string(),
  title: z.string(),
  /** Null in the DB schema; every ingestion surface (poll skip rule, ingest
   * body) requires a link, so real rows always carry one. */
  url: z.url().nullable(),
  /** Null when neither isoDate nor pubDate could be parsed. */
  publishedAt: z.iso.datetime().nullable(),
  summary: z.string().nullable(),
  status: FeedItemStatusEnum,
  /** Set when TAKEN — back-reference to the spawned ticket. */
  ticketId: z.uuid().nullable(),
  fetchedAt: z.iso.datetime(),
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

// GET /feed-items
export const ListFeedItemsQuerySchema = pageQuery.extend({
  status: FeedItemStatusEnum.optional(),
  feedSourceId: z.uuid().optional(),
  q: z.string().min(1).optional(),
  /** publishedAt range (inclusive). */
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export const ListFeedItemsResponseSchema = paginated(FeedItemSchema);

// GET /feed-items/:id — normalized fields + verbatim raw payload
export const FeedItemDetailSchema = FeedItemSchema.extend({
  raw: z.unknown(),
  sourceName: z.string(),
});
export type FeedItemDetail = z.infer<typeof FeedItemDetailSchema>;
