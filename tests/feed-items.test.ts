import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupUsers } from "./helpers.js";

/** ITEM-01: GET /feed-items filter matrix (status, feedSourceId, q, date range)
 * with pagination and envelope totals. Contract #12/#16: both feeds surfaces
 * require authentication (GET /feeds MGR, GET /feed-items ANY). Contract
 * #17/#18: item detail (ANY, verbatim raw) and the VIEWED transition (WORK,
 * 409 CONFLICT once TAKEN). */
describe("GET /feed-items (ITEM-01, #12/#16/#17/#18)", () => {
  let app: FastifyInstance;
  const tag = randomUUID();
  let sourceA: string;
  let sourceB: string;
  let admin = "";
  let analyst = "";

  const auth = (token: string) => ({ authorization: token });

  /** Every total assertion is scoped by q=<tag> or feedSourceId so concurrent
   * test files writing items to the shared dev DB cannot skew counts. */
  const list = (query: Record<string, string>) => {
    const params = new URLSearchParams({ q: tag, ...query });
    return app.inject({
      method: "GET",
      url: `/feed-items?${params.toString()}`,
      headers: auth(analyst),
    });
  };

  const seedItem = (
    feedId: string,
    title: string,
    guid: string,
    publishedAt: Date | null,
    status?: "VIEWED" | "TAKEN",
  ) =>
    prisma.feedItem.create({
      data: {
        feedId,
        guid,
        title,
        url: `https://items.example/${guid}`,
        publishedAt,
        raw: guid === "seed-b" ? { summary: "raw summary text", vendor: "Acme" } : {},
        ...(status ? { status } : {}),
      },
    });

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
    analyst = await bearerFor(app, "ANALYST");
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
    await seedItem(sourceA, `${tag} epsilon taken`, "seed-a4", new Date("2026-03-01T00:00:00.000Z"), "TAKEN");
  });

  afterAll(async () => {
    const seeded = [sourceA, sourceB].filter((id) => id !== undefined);
    await prisma.feedItem.deleteMany({ where: { feedId: { in: seeded } } });
    await prisma.feedSource.deleteMany({ where: { id: { in: seeded } } });
    await cleanupUsers();
    await app.close();
    await prisma.$disconnect();
  });

  it("#16: rejects an anonymous list request with 401", async () => {
    // Given: no authorization header
    // When: GET /feed-items anonymously
    const response = await app.inject({ method: "GET", url: `/feed-items?q=${tag}` });
    // Then: 401 error envelope
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });

  it("#12: GET /feeds is MGR-only — anonymous 401, analyst 403, admin 200", async () => {
    // Given: an anonymous caller, an ANALYST and an ADMIN token
    // When: GET /feeds as each
    const anon = await app.inject({ method: "GET", url: "/feeds" });
    const worker = await app.inject({ method: "GET", url: "/feeds", headers: auth(analyst) });
    const boss = await app.inject({ method: "GET", url: "/feeds", headers: auth(admin) });

    // Then: 401 / 403 / 200 envelope
    expect(anon.statusCode).toBe(401);
    expect(worker.statusCode).toBe(403);
    expect(boss.statusCode).toBe(200);
    expect(boss.json()).toHaveProperty("items");
  });

  it("lists every seeded item for the tag with envelope totals", async () => {
    // Given: five items across two sources
    // When: a plain scoped list is fetched
    const response = await list({});

    // Then: total 5 in the paginated envelope
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 5, page: 1, pageSize: 20 });
    expect(response.json().items).toHaveLength(5);
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

    // Then: 4 vs 1 items with matching feedSourceId on every row
    expect(onlyA.json().total).toBe(4);
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
    // Given/When: January–March 2026 bounds
    const response = await list({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-03-31T23:59:59.999Z",
    });

    // Then: alpha (Jan 10), beta (Feb 10), delta (Jan 15), epsilon (Mar 1)
    expect(response.json().total).toBe(4);
    const guids = response.json().items.map((item: { guid: string }) => item.guid).sort();
    expect(guids).toEqual(["seed-a1", "seed-a2", "seed-a4", "seed-b"]);
  });

  it("paginates without losing the total", async () => {
    // Given/When: page 2 at pageSize 2
    const page2 = await list({ page: "2", pageSize: "2" });
    const page3 = await list({ page: "3", pageSize: "2" });

    // Then: two rows on page 2, one on page 3, total stays 5
    expect(page2.json()).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(page2.json().items).toHaveLength(2);
    expect(page3.json()).toMatchObject({ total: 5, page: 3, pageSize: 2 });
    expect(page3.json().items).toHaveLength(1);
  });

  it("returns the normalized wire shape with derived summary and null ticket", async () => {
    // Given/When: the delta row (raw carries a summary string)
    const response = await list({ feedSourceId: sourceB });

    // Then: summary derived from raw, fetchedAt ISO, ticketId null, source named
    const item = response.json().items[0];
    expect(item).toMatchObject({
      guid: "seed-b",
      title: `${tag} delta openssl advisory`,
      summary: "raw summary text",
      status: "UNREVIEWED",
      ticketId: null,
      sourceName: `items-b-${tag}`,
    });
    expect(() => new Date(item.fetchedAt).toISOString()).not.toThrow();
  });

  it("rejects an unknown status with 400", async () => {
    // Given/When: a bogus status value
    const response = await app.inject({
      method: "GET",
      url: "/feed-items?status=BOGUS",
      headers: auth(analyst),
    });

    // Then: 400 validation failure
    expect(response.statusCode).toBe(400);
  });

  describe("#17 GET /feed-items/:id", () => {
    it("returns the detail with the verbatim raw payload and source name", async () => {
      // Given: the delta item whose raw carries a nested object
      const item = await prisma.feedItem.findFirstOrThrow({ where: { guid: "seed-b" } });

      // When: an authenticated ANY role fetches the detail
      const response = await app.inject({
        method: "GET",
        url: `/feed-items/${item.id}`,
        headers: auth(analyst),
      });

      // Then: 200 FeedItemDetailSchema with raw verbatim and sourceName
      expect(response.statusCode).toBe(200);
      const body = response.json() as { raw: Record<string, string>; sourceName: string };
      expect(body.raw).toEqual({ summary: "raw summary text", vendor: "Acme" });
      expect(body.sourceName).toBe(`items-b-${tag}`);
      expect(body).toMatchObject({ guid: "seed-b", status: "UNREVIEWED" });
    });

    it("404s for an unknown id", async () => {
      // Given/When: GET with a valid but nonexistent uuid
      const response = await app.inject({
        method: "GET",
        url: `/feed-items/${randomUUID()}`,
        headers: auth(analyst),
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
    });

    it("401s when anonymous", async () => {
      // Given: the delta item
      const item = await prisma.feedItem.findFirstOrThrow({ where: { guid: "seed-b" } });
      // When: no authorization header
      const response = await app.inject({ method: "GET", url: `/feed-items/${item.id}` });
      // Then: 401
      expect(response.statusCode).toBe(401);
    });
  });

  describe("#18 POST /feed-items/:id/view", () => {
    it("transitions UNREVIEWED → VIEWED and returns the item wire shape", async () => {
      // Given: an UNREVIEWED item
      const item = await seedItem(sourceA, `${tag} zeta to view`, "seed-a5", null);

      // When: a WORK role posts view
      const response = await app.inject({
        method: "POST",
        url: `/feed-items/${item.id}/view`,
        headers: auth(analyst),
      });

      // Then: 200 with status VIEWED, persisted
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: item.id, status: "VIEWED", guid: "seed-a5" });
      expect((await prisma.feedItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("VIEWED");
    });

    it("409 CONFLICTs once the item is TAKEN", async () => {
      // Given: a TAKEN item
      const item = await prisma.feedItem.findFirstOrThrow({ where: { guid: "seed-a4" } });

      // When: view is posted
      const response = await app.inject({
        method: "POST",
        url: `/feed-items/${item.id}/view`,
        headers: auth(analyst),
      });

      // Then: 409 CONFLICT and the status stays TAKEN
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("CONFLICT");
      expect((await prisma.feedItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("TAKEN");
    });

    it("404s for an unknown id and 401s when anonymous", async () => {
      // Given: a valid but nonexistent uuid
      // When: view posted anonymously, then authenticated
      const anon = await app.inject({ method: "POST", url: `/feed-items/${randomUUID()}/view` });
      const missing = await app.inject({
        method: "POST",
        url: `/feed-items/${randomUUID()}/view`,
        headers: auth(admin),
      });

      // Then: 401 anonymous, 404 authenticated-missing
      expect(anon.statusCode).toBe(401);
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe("NOT_FOUND");
    });
  });
});
