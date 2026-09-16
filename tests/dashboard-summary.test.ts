import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SummaryResponseSchema } from "../src/modules/dashboard/schema.js";
import { dashboardSummary } from "../src/modules/dashboard/summary.js";
import { prisma } from "../src/lib/db.js";

/** Fixtures live in an April 2026 window no other suite touches, so bounded
 * queries see exactly these rows and exact-count assertions stay stable. */
describe("dashboardSummary", () => {
  const tag = `dash-${randomUUID()}`;
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
      ["fi-early", "2026-04-19T00:00:00.000Z", "VIEWED"],
      ["fi-in-1", "2026-04-20T12:00:00.000Z", "UNREVIEWED"],
      ["fi-in-edge", "2026-04-20T23:59:59.999Z", "UNREVIEWED"],
      ["fi-after", "2026-04-21T00:00:00.001Z", "TAKEN"],
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
      ["tk-in-1", "2026-04-20T08:00:00.000Z", "OPEN"],
      ["tk-in-2", "2026-04-20T09:00:00.000Z", "OPEN"],
      ["tk-in-3", "2026-04-20T10:00:00.000Z", "SENT"],
      ["tk-after", "2026-04-21T10:00:00.000Z", "CLOSED"],
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
      ["dl-in-sent", "2026-04-20T12:00:00.000Z", "SENT"],
      ["dl-in-failed", "2026-04-20T13:00:00.000Z", "FAILED"],
      ["dl-after", "2026-04-22T00:00:00.000Z", "SENT"],
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

  it("aggregates a date-only bounded range across all three sections", async () => {
    // Given: fixtures on 2026-04-19 through 2026-04-22
    // When: the summary is queried for 2026-04-20 only
    const summary = await dashboardSummary({ from: "2026-04-20", to: "2026-04-20" });

    // Then: inclusive day edges hold and sparse group-bys omit zero statuses
    expect(summary).toEqual({
      feedItems: { total: 2, byStatus: { UNREVIEWED: 2 } },
      tickets: { total: 3, byStatus: { OPEN: 2, SENT: 1 } },
      deliveries: { sent: 1, failed: 1 },
    });
    expect(SummaryResponseSchema.safeParse(summary).success).toBe(true);
  });

  it("honors datetime bounds", async () => {
    // Given: a one-hour window inside the fixture day
    // When: the summary is queried from 12:30 to 13:30 UTC
    const summary = await dashboardSummary({
      from: "2026-04-20T12:30:00.000Z",
      to: "2026-04-20T13:30:00.000Z",
    });

    // Then: only the 13:00 FAILED delivery falls inside
    expect(summary.feedItems).toEqual({ total: 0, byStatus: {} });
    expect(summary.tickets).toEqual({ total: 0, byStatus: {} });
    expect(summary.deliveries).toEqual({ sent: 0, failed: 1 });
  });

  it("counts everything when no bounds are given", async () => {
    // Given: fixtures inside the shared database
    // When: the summary is queried without a range
    const summary = await dashboardSummary({});

    // Then: unbounded totals cover the bounded totals and each total equals
    // the sum of its per-status counts
    const bounded = await dashboardSummary({ from: "2026-04-20", to: "2026-04-20" });
    expect(summary.feedItems.total).toBeGreaterThanOrEqual(bounded.feedItems.total);
    expect(summary.tickets.total).toBeGreaterThanOrEqual(bounded.tickets.total);
    expect(summary.deliveries.sent).toBeGreaterThanOrEqual(bounded.deliveries.sent);
    expect(summary.deliveries.failed).toBeGreaterThanOrEqual(bounded.deliveries.failed);

    const feedItemStatusSum = Object.values(summary.feedItems.byStatus).reduce(
      (sum, n) => sum + (n ?? 0),
      0,
    );
    const ticketStatusSum = Object.values(summary.tickets.byStatus).reduce(
      (sum, n) => sum + (n ?? 0),
      0,
    );
    expect(feedItemStatusSum).toBe(summary.feedItems.total);
    expect(ticketStatusSum).toBe(summary.tickets.total);
  });
});
