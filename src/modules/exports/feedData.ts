import type { Prisma } from "../../generated/prisma/client.js";
import type { FeedItemStatus as PrismaFeedItemStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/db.js";
import { dateBound } from "../tickets/schema.js";

/**
 * Feed export data access (TASK-EXP feed rows): streams FeedItem rows for an
 * export window via cursor-batched findMany — memory stays bounded regardless
 * of window size — plus a per-status groupBy for the export summary. Bounds
 * are the wire-level date/datetime strings already validated by
 * CreateExportBodySchema; date-only values expand to UTC day edges.
 */

/** One streamed export row: full item scalars + source display name +
 * verbatim raw payload, mirroring the detail endpoints' export contract. */
export type FeedExportRowData = Prisma.FeedItemGetPayload<{
  include: { feed: { select: { name: true } } };
}>;

/** Per-status counts; statuses with zero rows are absent, not zero-filled. */
export type FeedStatusBreakdown = Partial<Record<PrismaFeedItemStatus, number>>;

export const FEED_EXPORT_BATCH_SIZE = 500;

function publishedWhere(
  from: string | undefined,
  to: string | undefined,
): Prisma.FeedItemWhereInput {
  if (from === undefined && to === undefined) {
    return {};
  }
  return {
    publishedAt: {
      ...(from === undefined ? {} : { gte: dateBound(from, false) }),
      ...(to === undefined ? {} : { lte: dateBound(to, true) }),
    },
  };
}

/** Stream every feed item whose publishedAt falls inside the inclusive
 * window, in stable createdAt/id order, batchSize rows per query. */
export async function* iterateFeedExportRows(
  from: string | undefined,
  to: string | undefined,
  batchSize: number = FEED_EXPORT_BATCH_SIZE,
): AsyncGenerator<FeedExportRowData> {
  const where = publishedWhere(from, to);
  let cursorId: string | undefined;
  for (;;) {
    const batch: FeedExportRowData[] = await prisma.feedItem.findMany({
      where,
      include: { feed: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...(cursorId === undefined ? {} : { cursor: { id: cursorId }, skip: 1 }),
      take: batchSize,
    });
    for (const row of batch) {
      yield row;
    }
    const last = batch.at(-1);
    if (batch.length < batchSize || last === undefined) {
      return;
    }
    cursorId = last.id;
  }
}

/** Count feed items per triage status over the same inclusive window. */
export async function feedStatusBreakdown(
  from: string | undefined,
  to: string | undefined,
): Promise<FeedStatusBreakdown> {
  const rows = await prisma.feedItem.groupBy({
    by: ["status"],
    where: publishedWhere(from, to),
    _count: { _all: true },
  });
  const breakdown: FeedStatusBreakdown = {};
  for (const row of rows) {
    breakdown[row.status] = row._count._all;
  }
  return breakdown;
}
