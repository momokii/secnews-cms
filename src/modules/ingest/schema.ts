import { z } from "zod/v4";
import { FeedItemSchema } from "../feeds/schema.js";

/** External push ingestion (X-API-Key header, timing-safe compare — no JWT).
 * Same normalized shape as RSS items; `raw` stored verbatim. Upsert is
 * idempotent per (sourceName, link). */

// POST /ingest
export const IngestHeaderSchema = z.object({
  "x-api-key": z.string().min(1),
});

export const IngestBodySchema = z.object({
  sourceName: z.string().min(1),
  title: z.string().min(1),
  link: z.url(),
  /** ISO 8601; offsets allowed because external pushers pick their zone. */
  publishedAt: z.iso.datetime({ offset: true }),
  summary: z.string().optional(),
  raw: z.unknown().optional(),
});
export type IngestBody = z.infer<typeof IngestBodySchema>;

export const IngestResponseSchema = z.object({
  item: FeedItemSchema,
});
