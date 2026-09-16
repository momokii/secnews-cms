import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FeedItemStatus } from "../src/generated/prisma/enums.js";
import { prisma } from "../src/lib/db.js";
import { feedStatusBreakdown, iterateFeedExportRows } from "../src/modules/exports/feedData.js";

/** Feed export data access: the async generator streams window-scoped rows
 * (feed name + verbatim raw) via cursor-batched findMany, and the breakdown
 * counts per triage status over the same window. Real Postgres, rows tagged
 * and cleaned up in afterAll. */

const tag = `c5feed-${randomUUID().slice(0, 8)}`;

/** Structural contract of a yielded row (feed join + verbatim raw). */
type IteratedRow = {
  id: string;
  status: FeedItemStatus;
  createdAt: Date;
  raw: unknown;
  feed: { name: string };
};

type SeededItem = Omit<IteratedRow, "createdAt">;

/** publishedAt used by the window tests: date-only from/to expand to UTC day
 * edges, so the window is [2026-09-01T00:00:00.000Z, 2026-09-15T23:59:59.999Z]. */
const FROM = "2026-09-01";
const TO = "2026-09-15";

const itemIds: string[] = [];
const sourceIds: string[] = [];
const sources = new Map<string, string>();
let seeded: SeededItem[] = [];

async function seedItem(input: {
  feedName: string;
  status: FeedItemStatus;
  publishedAt: Date | null;
  raw: unknown;
}): Promise<SeededItem> {
  let sourceId = sources.get(input.feedName);
  if (sourceId === undefined) {
    const source = await prisma.feedSource.create({
      data: { name: input.feedName, url: `https://example.com/${tag}-${randomUUID()}.rss` },
      select: { id: true },
    });
    sourceId = source.id;
    sources.set(input.feedName, sourceId);
    sourceIds.push(sourceId);
  }
  const item = await prisma.feedItem.create({
    data: {
      feedId: sourceId,
      guid: `${tag}-${randomUUID()}`,
      title: `${tag} item`,
      raw: input.raw as object,
      status: input.status,
      publishedAt: input.publishedAt,
      // createdAt drives the generator's stable ordering
      createdAt: input.publishedAt ?? new Date("2026-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  itemIds.push(item.id);
  return {
    id: item.id,
    feed: { name: input.feedName },
    status: input.status,
    raw: input.raw,
  };
}

beforeAll(async () => {
  seeded = [
    // Outside the window on both edges
    await seedItem({
      feedName: `${tag} early`,
      status: "UNREVIEWED",
      publishedAt: new Date("2026-08-31T23:59:59.999Z"),
      raw: { edge: "before" },
    }),
    await seedItem({
      feedName: `${tag} late`,
      status: "VIEWED",
      publishedAt: new Date("2026-09-16T00:00:00.000Z"),
      raw: { edge: "after" },
    }),
    // In-window: window-start boundary, middle, second feed, window-end boundary
    await seedItem({
      feedName: `${tag} alpha`,
      status: "UNREVIEWED",
      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      raw: { k: 1, nested: { items: ["a", "b"] } },
    }),
    await seedItem({
      feedName: `${tag} alpha`,
      status: "VIEWED",
      publishedAt: new Date("2026-09-10T12:00:00.000Z"),
      raw: { k: 2 },
    }),
    await seedItem({
      feedName: `${tag} beta`,
      status: "TAKEN",
      publishedAt: new Date("2026-09-12T08:30:00.000Z"),
      raw: { k: 3 },
    }),
    await seedItem({
      feedName: `${tag} beta`,
      status: "UNREVIEWED",
      publishedAt: new Date("2026-09-15T23:59:59.999Z"),
      raw: { k: 4 },
    }),
    // Null publishedAt is out of scope whenever a window is set
    await seedItem({
      feedName: `${tag} alpha`,
      status: "UNREVIEWED",
      publishedAt: null,
      raw: { k: 5 },
    }),
  ];
});

afterAll(async () => {
  if (itemIds.length > 0) {
    await prisma.feedItem.deleteMany({ where: { id: { in: itemIds } } });
  }
  if (sourceIds.length > 0) {
    await prisma.feedSource.deleteMany({ where: { id: { in: sourceIds } } });
  }
  await prisma.$disconnect();
});

const insideIds = (): string[] => seeded.slice(2, 6).map((item) => item.id);

async function collect(from: string | undefined, to: string | undefined, batchSize = 500) {
  const rows: IteratedRow[] = [];
  for await (const row of iterateFeedExportRows(from, to, batchSize)) {
    rows.push(row);
  }
  return rows;
}

/** Project an iteration result down to the rows this suite seeded. */
function mine(rows: IteratedRow[]): SeededItem[] {
  const byId = new Map(seeded.map((item) => [item.id, item]));
  return rows.flatMap((row) => {
    const item = byId.get(row.id);
    return item === undefined ? [] : [item];
  });
}

describe("iterateFeedExportRows", () => {
  it("streams exactly the in-window rows in createdAt order across small batches", async () => {
    // Given: seeded items inside and outside the 2026-09-01..15 window
    // When: iterating with a batch size of 2 (forces 3 cursor batches)
    const rows = await collect(FROM, TO, 2);
    const seen = mine(rows);

    // Then: only in-window ids, unique, ordered by createdAt asc
    expect(seen.map((row) => row.id).sort()).toEqual(insideIds().sort());
    const order = rows.map((row) => row.createdAt.toISOString());
    expect(order).toEqual([...order].sort());
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it("carries the feed name and the verbatim raw payload on every row", async () => {
    // Given: in-window rows from two feeds with distinct raw payloads
    // When: iterating the window
    const rows = await collect(FROM, TO);
    const seen = mine(rows);

    // Then: each row joins its feed name and deep-equals the stored raw
    expect(seen.length).toBe(4);
    for (const item of seen) {
      const row = rows.find((candidate) => candidate.id === item.id);
      expect(row?.feed.name).toBe(item.feed.name);
      expect(row?.raw).toEqual(item.raw);
      expect(row?.status).toBe(item.status);
    }
  });

  it("treats both bounds as optional", async () => {
    // Given: no window at all
    // When: iterating without bounds
    const rows = await collect(undefined, undefined);

    // Then: every seeded row (in and out of window) is in the result
    const seenIds = new Set(rows.map((row) => row.id));
    for (const item of seeded) {
      expect(seenIds.has(item.id)).toBe(true);
    }
  });

  it("yields nothing for a window with no matching rows", async () => {
    // Given: a far-future window with no seeded items
    // When: iterating it
    const rows = await collect("2030-01-01", "2030-01-02");

    // Then: the generator ends without yielding any seeded row
    expect(mine(rows)).toEqual([]);
  });
});

describe("feedStatusBreakdown", () => {
  it("counts per status over the window and ignores out-of-window rows", async () => {
    // Given: in-window statuses UNREVIEWED x2, VIEWED, TAKEN; two rows outside
    // When: breaking the window down by status
    const breakdown = await feedStatusBreakdown(FROM, TO);

    // Then: only in-window rows are counted, zero-count statuses stay absent
    expect(breakdown).toEqual({ UNREVIEWED: 2, VIEWED: 1, TAKEN: 1 });
  });

  it("returns an empty breakdown for an empty window", async () => {
    // Given: a window with no seeded items
    // When: breaking it down by status
    const breakdown = await feedStatusBreakdown("2030-01-01", "2030-01-02");

    // Then: no keys at all
    expect(breakdown).toEqual({});
  });
});
