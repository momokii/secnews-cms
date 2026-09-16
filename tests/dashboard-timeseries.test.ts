import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TimeseriesResponseSchema } from "../src/modules/dashboard/schema.js";
import { dashboardTimeseries } from "../src/modules/dashboard/timeseries.js";
import { prisma } from "../src/lib/db.js";

/** Fixtures live in a May 2026 window no other suite touches. Rows are chosen
 * so UTC-day and Asia/Jakarta-day bucketing disagree: 16:59:59.999Z and
 * 17:00:00.000Z straddle Jakarta midnight, and 2026-05-19T20:00Z /
 * 2026-05-20T17:30Z fall on the next Jakarta day. Exact-count assertions
 * stay stable because the range filter only sees these rows. */
describe("dashboardTimeseries", () => {
  const tag = `dash-ts-${randomUUID()}`;
  let feedSourceId: string;
  let clientId: string;
  let channelId: string;
  const feedItemIds: string[] = [];
  const ticketIds: string[] = [];
  const auditIds: string[] = [];

  beforeAll(async () => {
    const feedSource = await prisma.feedSource.create({
      data: { name: tag, url: `https://feeds.test/${tag}.rss` },
      select: { id: true },
    });
    feedSourceId = feedSource.id;

    for (const [suffix, createdAt, status] of [
      ["fi-jkt-same", "2026-05-19T12:00:00.000Z", "VIEWED"],
      ["fi-jkt-shift", "2026-05-19T20:00:00.000Z", "UNREVIEWED"],
      ["fi-late", "2026-05-21T00:30:00.000Z", "TAKEN"],
    ] as const) {
      const item = await prisma.feedItem.create({
        data: {
          feedId: feedSourceId,
          guid: `${tag}-${suffix}`,
          title: `${tag} ${suffix}`,
          status,
          raw: {},
          createdAt: new Date(createdAt),
        },
        select: { id: true },
      });
      feedItemIds.push(item.id);
    }

    for (const [suffix, createdAt, status] of [
      ["tk-jkt-20", "2026-05-20T02:00:00.000Z", "OPEN"],
      ["tk-jkt-21", "2026-05-20T17:30:00.000Z", "RESEARCH"],
    ] as const) {
      const ticket = await prisma.ticket.create({
        data: {
          title: `${tag} ${suffix}`,
          summary: `${tag} summary`,
          origin: "MANUAL",
          status,
          findingType: "OTHER",
          createdAt: new Date(createdAt),
        },
        select: { id: true },
      });
      ticketIds.push(ticket.id);
    }

    const client = await prisma.client.create({
      data: { name: tag },
      select: { id: true },
    });
    clientId = client.id;
    const channel = await prisma.channel.create({
      data: { clientId, type: "EMAIL", target: `${tag}@secnews.test` },
      select: { id: true },
    });
    channelId = channel.id;

    for (const [suffix, createdAt, status] of [
      ["dl-before-midnight", "2026-05-19T16:59:59.999Z", "SENT"],
      ["dl-at-midnight", "2026-05-19T17:00:00.000Z", "FAILED"],
    ] as const) {
      const audit = await prisma.deliveryAudit.create({
        data: {
          ticketId: ticketIds[0] as string,
          channelId,
          status,
          payload: `${tag} ${suffix}`,
          sentById: "00000000-0000-0000-0000-000000000000",
          createdAt: new Date(createdAt),
        },
        select: { id: true },
      });
      auditIds.push(audit.id);
    }
  });

  afterAll(async () => {
    await prisma.deliveryAudit.deleteMany({ where: { id: { in: auditIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.channel.delete({ where: { id: channelId } });
    await prisma.client.delete({ where: { id: clientId } });
    await prisma.feedItem.deleteMany({ where: { id: { in: feedItemIds } } });
    await prisma.feedSource.delete({ where: { id: feedSourceId } });
    await prisma.$disconnect();
  });

  it("buckets by Asia/Jakarta day and zero-fills to the range edges", async () => {
    // Given: rows on Jakarta days 2026-05-19..2026-05-21 plus one ms before
    // and exactly at Jakarta midnight
    // When: the series covers 2026-05-19 through 2026-05-21 (date-only)
    const result = await dashboardTimeseries({
      from: "2026-05-19",
      to: "2026-05-21",
      interval: "day",
    });

    // Then: each bucket is the UTC instant of Jakarta midnight, 2026-05-20T20Z
    // lands on the next Jakarta day, the 16:59:59.999Z/17:00Z pair splits
    // across midnight, and the fixture-free Jakarta day 2026-05-22 is
    // zero-filled rather than absent
    expect(result).toEqual({
      buckets: [
        { bucket: "2026-05-18T17:00:00.000Z", feedItems: 1, tickets: 0, deliveries: 1 },
        { bucket: "2026-05-19T17:00:00.000Z", feedItems: 1, tickets: 1, deliveries: 1 },
        { bucket: "2026-05-20T17:00:00.000Z", feedItems: 1, tickets: 1, deliveries: 0 },
        { bucket: "2026-05-21T17:00:00.000Z", feedItems: 0, tickets: 0, deliveries: 0 },
      ],
    });
    expect(TimeseriesResponseSchema.safeParse(result).success).toBe(true);
  });

  it("maps datetime bounds onto the single Jakarta day they overlap", async () => {
    // Given: bounds spanning exactly Jakarta day 2026-05-20 (17:00Z inclusive)
    // When: the series is queried with full datetimes
    const result = await dashboardTimeseries({
      from: "2026-05-19T17:00:00.000Z",
      to: "2026-05-20T16:59:59.999Z",
      interval: "day",
    });

    // Then: exactly one bucket holds that day's rows
    expect(result).toEqual({
      buckets: [
        { bucket: "2026-05-19T17:00:00.000Z", feedItems: 1, tickets: 1, deliveries: 1 },
      ],
    });
  });

  it("covers the observed span contiguously when no bounds are given", async () => {
    // Given: fixtures inside the shared database
    // When: the series is queried without a range
    const result = await dashboardTimeseries({ interval: "day" });

    // Then: buckets ascend in exact 24h steps over the observed Jakarta days
    // (2026-05-19..2026-05-21), and each fixture-day count is at least the
    // bounded count
    const buckets = result.buckets.map((b) => b.bucket);
    expect(buckets.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < buckets.length; i++) {
      const step = Date.parse(buckets[i] as string) - Date.parse(buckets[i - 1] as string);
      expect(step).toBe(86_400_000);
    }

    const at = (bucket: string, key: "feedItems" | "tickets" | "deliveries"): number | undefined =>
      result.buckets.find((b) => b.bucket === bucket)?.[key];
    expect(at("2026-05-18T17:00:00.000Z", "feedItems")).toBeGreaterThanOrEqual(1);
    expect(at("2026-05-18T17:00:00.000Z", "deliveries")).toBeGreaterThanOrEqual(1);
    expect(at("2026-05-19T17:00:00.000Z", "tickets")).toBeGreaterThanOrEqual(1);
    expect(at("2026-05-20T17:00:00.000Z", "feedItems")).toBeGreaterThanOrEqual(1);
  });
});
