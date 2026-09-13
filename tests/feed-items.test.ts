import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";

/** ITEM-01: GET /feed-items filter matrix (status, feedSourceId, q, date range)
 * with pagination and envelope totals. */
describe("GET /feed-items (ITEM-01)", () => {
  let app: FastifyInstance;
  const tag = randomUUID();
  let sourceA: string;
  let sourceB: string;

  /** Every total assertion is scoped by q=<tag> or feedSourceId so concurrent
   * test files writing items to the shared dev DB cannot skew counts. */
  const list = (query: Record<string, string>) => {
    const params = new URLSearchParams({ q: tag, ...query });
    return app.inject({ method: "GET", url: `/feed-items?${params.toString()}` });
  };

  const seedItem = (feedId: string, title: string, guid: string, publishedAt: Date | null, status?: "VIEWED") =>
    prisma.feedItem.create({
      data: {
        feedId,
        guid,
        title,
        url: `https://items.example/${guid}`,
        publishedAt,
        raw: guid === "seed-b" ? { summary: "raw summary text" } : {},
        ...(status ? { status } : {}),
      },
    });

  beforeAll(async () => {
    app = await buildApp();
    const a = await prisma.feedSource.create({
      data: { name: `items-a-${tag}`, url: `https://items.example/${tag}/a.xml` },
    });
    const b = await prisma.feedSource.create({
      data: { name: `items-b-${tag}`, url: `https://items.example/${tag}/b.xml` },
    });
    sourceA = a.id;
    sourceB = b.id;
    await seedItem(sourceA, `${tag} alpha openssl cve`, "seed-a1", new Date("2026-01-10T00:00:00.000Z"));
    await seedItem(sourceA, `${tag} beta ransomware`, "seed-a2", new Date("2026-02-10T00:00:00.000Z"), "VIEWED");
    await seedItem(sourceA, `${tag} gamma stale`, "seed-a3", new Date("2025-12-01T00:00:00.000Z"));
    await seedItem(sourceB, `${tag} delta openssl advisory`, "seed-b", new Date("2026-01-15T00:00:00.000Z"));
  });

  afterAll(async () => {
    const seeded = [sourceA, sourceB].filter((id) => id !== undefined);
    await prisma.feedItem.deleteMany({ where: { feedId: { in: seeded } } });
    await prisma.feedSource.deleteMany({ where: { id: { in: seeded } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("lists every seeded item for the tag with envelope totals", async () => {
    // Given: four items across two sources
    // When: a plain scoped list is fetched
    const response = await list({});

    // Then: total 4 in the paginated envelope
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 4, page: 1, pageSize: 20 });
    expect(response.json().items).toHaveLength(4);
  });

  it("filters by status", async () => {
    // Given/When: the scoped list filtered to VIEWED
    const response = await list({ status: "VIEWED" });

    // Then: only the viewed item
    expect(response.json().total).toBe(1);
    expect(response.json().items[0].guid).toBe("seed-a2");
  });

  it("filters by feedSourceId", async () => {
    // Given/When: the scoped list restricted to source A, then source B
    const onlyA = await list({ feedSourceId: sourceA });
    const onlyB = await list({ feedSourceId: sourceB });

    // Then: 3 vs 1 items with matching feedSourceId on every row
    expect(onlyA.json().total).toBe(3);
    expect(onlyA.json().items.every((item: { feedSourceId: string }) => item.feedSourceId === sourceA)).toBe(true);
    expect(onlyB.json().total).toBe(1);
    expect(onlyB.json().items[0].guid).toBe("seed-b");
  });

  it("combines status and feedSourceId", async () => {
    // Given/When: source A filtered to UNREVIEWED
    const response = await list({ feedSourceId: sourceA, status: "UNREVIEWED" });

    // Then: alpha + gamma remain
    expect(response.json().total).toBe(2);
  });

  it("matches q case-insensitively on the title", async () => {
    // Given/When: an uppercase q for the alpha item scoped to source A
    const response = await list({ q: "ALPHA", feedSourceId: sourceA });

    // Then: exactly the alpha row
    expect(response.json().total).toBe(1);
    expect(response.json().items[0].guid).toBe("seed-a1");
  });

  it("filters by the publishedAt date range", async () => {
    // Given/When: January 2026 bounds
    const response = await list({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T23:59:59.999Z",
    });

    // Then: alpha (Jan 10) and delta (Jan 15)
    expect(response.json().total).toBe(2);
    const guids = response.json().items.map((item: { guid: string }) => item.guid).sort();
    expect(guids).toEqual(["seed-a1", "seed-b"]);
  });

  it("paginates without losing the total", async () => {
    // Given/When: page 2 at pageSize 2
    const page2 = await list({ page: "2", pageSize: "2" });
    const page3 = await list({ page: "3", pageSize: "2" });

    // Then: half the rows on page 2, none on page 3, total stays 4
    expect(page2.json()).toMatchObject({ total: 4, page: 2, pageSize: 2 });
    expect(page2.json().items).toHaveLength(2);
    expect(page3.json()).toMatchObject({ total: 4, page: 3, pageSize: 2 });
    expect(page3.json().items).toHaveLength(0);
  });

  it("returns the normalized wire shape with derived summary and null ticket", async () => {
    // Given/When: the delta row (raw carries a summary string)
    const response = await list({ feedSourceId: sourceB });

    // Then: summary derived from raw, fetchedAt ISO, ticketId null
    const item = response.json().items[0];
    expect(item).toMatchObject({
      guid: "seed-b",
      title: `${tag} delta openssl advisory`,
      summary: "raw summary text",
      status: "UNREVIEWED",
      ticketId: null,
    });
    expect(() => new Date(item.fetchedAt).toISOString()).not.toThrow();
  });

  it("rejects an unknown status with 400", async () => {
    // Given/When: a bogus status value
    const response = await app.inject({ method: "GET", url: "/feed-items?status=BOGUS" });

    // Then: 400 validation failure
    expect(response.statusCode).toBe(400);
  });
});
