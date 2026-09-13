import Parser from "rss-parser";
import { prisma } from "../db.js";
import { upsertFeedItem } from "../feeds/store.js";

/** Canonical upstream fetch contract: bounded wait, identifiable agent. */
export const FEED_PARSER_OPTIONS = {
  timeout: 10_000,
  headers: { "User-Agent": "SecNews/1.0" },
} as const;

/** Structural subset of the rss-parser surface the poller needs; tests inject fakes. */
export type FeedParser = { parseURL(url: string): Promise<{ items?: RssItem[] }> };

export type RssItem = {
  title?: unknown;
  link?: unknown;
  guid?: unknown;
  isoDate?: unknown;
  pubDate?: unknown;
  [key: string]: unknown;
};

export type PollStats = { fetched: number; stored: number; skipped: number };

export function createFeedParser(): FeedParser {
  return new Parser(FEED_PARSER_OPTIONS);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Polls one feed: malformed items are skipped (counted, never persisted),
 * parser failures are swallowed (a dead upstream must not kill the sweep). */
export async function pollFeedSource(
  feed: { id: string; url: string },
  parser: FeedParser = createFeedParser(),
): Promise<PollStats> {
  let parsed: { items?: RssItem[] };
  try {
    parsed = await parser.parseURL(feed.url);
  } catch {
    return { fetched: 0, stored: 0, skipped: 0 };
  }

  const items = parsed.items ?? [];
  let stored = 0;
  let skipped = 0;
  for (const item of items) {
    const guid = typeof item.guid === "string" && item.guid !== "" ? item.guid
      : typeof item.link === "string" ? item.link : undefined;
    if (typeof item.title !== "string" || item.title === "" || guid === undefined
      || typeof item.link !== "string" || item.link === "") {
      skipped += 1;
      continue;
    }
    await upsertFeedItem({
      feedId: feed.id,
      guid,
      title: item.title,
      url: item.link,
      publishedAt: parseDate(item.isoDate ?? item.pubDate),
      raw: item,
    });
    stored += 1;
  }
  return { fetched: items.length, stored, skipped };
}

/** Sweeps every active feed source sequentially; one source failing never
 * rejects the whole batch. */
export async function pollAllFeeds(parser: FeedParser = createFeedParser()): Promise<PollStats> {
  const feeds = await prisma.feedSource.findMany({
    where: { isActive: true },
    select: { id: true, url: true },
  });
  const total: PollStats = { fetched: 0, stored: 0, skipped: 0 };
  for (const feed of feeds) {
    const stats = await pollFeedSource(feed, parser);
    total.fetched += stats.fetched;
    total.stored += stats.stored;
    total.skipped += stats.skipped;
  }
  return total;
}
