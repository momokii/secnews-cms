import type { FeedItem, FeedItemStatus, FeedSource } from "./schema.js";

/** Adapts prisma rows to the B2 wire shapes: prisma `isActive`/`feedId`/
 * `createdAt` become `active`/`feedSourceId`/`fetchedAt`; ids are uuid strings
 * and datetimes ISO strings. `summary` is derived from the verbatim raw payload
 * (there is no summary column — the raw blob owns it). */

export type FeedItemRow = {
  id: string;
  feedId: string;
  guid: string;
  title: string;
  url: string | null;
  publishedAt: Date | null;
  status: FeedItemStatus;
  raw: unknown;
  createdAt: Date;
  ticket?: { id: string } | null;
  feed?: { name: string } | null;
};

export function toFeedSourceWire(source: {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): FeedSource {
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    active: source.isActive,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function summaryFromRaw(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || !("summary" in raw)) {
    return null;
  }
  const summary = raw["summary"];
  return typeof summary === "string" ? summary : null;
}

export function toFeedItemWire(item: FeedItemRow): FeedItem {
  return {
    id: item.id,
    feedSourceId: item.feedId,
    guid: item.guid,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    summary: summaryFromRaw(item.raw),
    status: item.status,
    ticketId: item.ticket?.id ?? null,
    fetchedAt: item.createdAt.toISOString(),
    ...(item.feed === undefined || item.feed === null
      ? {}
      : { sourceName: item.feed.name }),
  };
}
