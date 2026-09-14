import { prisma } from "../db.js";

/** Single dedupe write path for feed items. Idempotent per (feedId, guid) —
 * the composite unique every ingestion surface (RSS poll, external push)
 * funnels through. A feed also never stores two items with the same
 * (trimmed, case-exact) title: before any write, an existing same-source row
 * with that title wins and the payload is reported as `deduped`. The check is
 * application-level on purpose — titles are unbounded text, so a Postgres
 * unique index (b-tree entry cap ~2.7 kB) would make inserts of legitimate
 * long titles fail rather than dedupe them. Re-ingest of a known
 * (feedId, guid) whose title is new or changed refreshes the normalized
 * fields + raw blob and never touches triage state (`status`). */

export type UpsertFeedItemInput = {
  feedId: string;
  guid: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  raw: unknown;
};

export type UpsertFeedItemResult = {
  item: Awaited<ReturnType<typeof prisma.feedItem.findFirstOrThrow>>;
  /** True when an existing same-source row with the same trimmed title
   * absorbed the payload instead of a write. */
  deduped: boolean;
};

export async function upsertFeedItem(input: UpsertFeedItemInput): Promise<UpsertFeedItemResult> {
  const { feedId, guid, url, publishedAt, raw } = input;
  const title = input.title.trim();
  // `raw` arrives from the JSON wire (ingest) or the parsed RSS item — both are
  // JSON-safe by construction, so the storage cast is sound.
  const rawJson = raw as Parameters<typeof prisma.feedItem.create>[0]["data"]["raw"];
  const byTitle = await prisma.feedItem.findFirst({ where: { feedId, title } });
  if (byTitle !== null) {
    return { item: byTitle, deduped: true };
  }
  const item = await prisma.feedItem.upsert({
    where: { feedId_guid: { feedId, guid } },
    update: { title, url, publishedAt, raw: rawJson },
    create: { feedId, guid, title, url, publishedAt, raw: rawJson },
  });
  return { item, deduped: false };
}
