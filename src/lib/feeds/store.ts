import { prisma } from "../db.js";

/** Single dedupe write path for feed items. Idempotent per (feedId, guid) —
 * the composite unique every ingestion surface (RSS poll, external push)
 * funnels through. Re-ingest refreshes the normalized fields + raw blob and
 * never touches triage state (`status`). */

export type UpsertFeedItemInput = {
  feedId: string;
  guid: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  raw: unknown;
};

export async function upsertFeedItem(input: UpsertFeedItemInput) {
  const { feedId, guid, title, url, publishedAt, raw } = input;
  // `raw` arrives from the JSON wire (ingest) or the parsed RSS item — both are
  // JSON-safe by construction, so the storage cast is sound.
  const rawJson = raw as Parameters<typeof prisma.feedItem.create>[0]["data"]["raw"];
  return prisma.feedItem.upsert({
    where: { feedId_guid: { feedId, guid } },
    update: { title, url, publishedAt, raw: rawJson },
    create: { feedId, guid, title, url, publishedAt, raw: rawJson },
  });
}
