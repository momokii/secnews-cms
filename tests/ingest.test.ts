import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";

/** ING-01: push upsert is idempotent per (sourceName, link). ING-03: wrong/missing
 * X-API-Key → 401. ING-04: valid push persists normalized fields + verbatim raw. */
describe("POST /ingest (ING-01, ING-03, ING-04)", () => {
  let app: FastifyInstance;
  const tag = randomUUID();
  const sourceName = `ingest-${tag}`;
  const apiKey = process.env["INGEST_API_KEY"] ?? "";

  const push = (payload: Record<string, unknown>, key: string = apiKey) =>
    app.inject({
      method: "POST",
      url: "/ingest",
      headers: key === "" ? {} : { "x-api-key": key },
      payload,
    });

  const body = (link: string) => ({
    sourceName,
    title: `ING push ${tag}`,
    link,
    publishedAt: "2026-03-01T10:30:00.000Z",
    summary: "pushed summary",
    raw: { summary: "pushed summary", extra: 1 },
  });

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    const sources = await prisma.feedSource.findMany({
      where: { OR: [{ name: sourceName }, { name: { startsWith: `rss-of-${tag}` } }] },
      select: { id: true },
    });
    await prisma.feedItem.deleteMany({ where: { feedId: { in: sources.map((s) => s.id) } } });
    await prisma.feedSource.deleteMany({ where: { id: { in: sources.map((s) => s.id) } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("ING-03: rejects a wrong key with 401 UNAUTHORIZED", async () => {
    // Given: a valid push body
    // When: POST /ingest with a wrong X-API-Key
    const response = await push(body(`https://push.example/${tag}/wrong-key`), "totally-wrong-key");

    // Then: 401 with the canonical envelope, nothing persisted
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
    const sources = await prisma.feedSource.findMany({ where: { name: sourceName } });
    expect(sources).toHaveLength(0);
  });

  it("ING-03: rejects a missing key with 401 UNAUTHORIZED", async () => {
    // Given: a valid push body
    // When: POST /ingest without any X-API-Key header
    const response = await push(body(`https://push.example/${tag}/no-key`), "");

    // Then: 401 UNAUTHORIZED
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });

  it("ING-04: a valid push creates raw + normalized under a resolved source", async () => {
    // Given: a valid push body from an unknown source name
    const link = `https://push.example/${tag}/item-1`;

    // When: POST /ingest with the correct key
    const response = await push(body(link));

    // Then: 201 with the normalized wire item
    expect(response.statusCode).toBe(201);
    const item = response.json().item;
    expect(item.guid).toBe(link);
    expect(item.url).toBe(link);
    expect(item.title).toBe(`ING push ${tag}`);
    expect(item.publishedAt).toBe("2026-03-01T10:30:00.000Z");
    expect(item.summary).toBe("pushed summary");
    expect(item.status).toBe("UNREVIEWED");
    expect(item.ticketId).toBeNull();
    expect(item.feedSourceId).toEqual(expect.any(String));

    // And: the DB row carries the verbatim raw payload alongside normalized fields
    const row = await prisma.feedItem.findUnique({
      where: { feedId_guid: { feedId: item.feedSourceId, guid: link } },
    });
    expect(row).not.toBeNull();
    expect(row?.title).toBe(`ING push ${tag}`);
    expect(row?.raw).toEqual({ summary: "pushed summary", extra: 1 });

    // And: the push-only source was created with the pushed sourceName
    const source = await prisma.feedSource.findUnique({ where: { id: item.feedSourceId } });
    expect(source?.name).toBe(sourceName);
  });

  it("ING-01: re-pushing the same (sourceName, link) never duplicates rows", async () => {
    // Given: the item pushed by the previous test
    const link = `https://push.example/${tag}/item-1`;
    const before = await prisma.feedItem.findMany({
      where: { guid: { startsWith: `https://push.example/${tag}/` } },
    });
    expect(before).toHaveLength(1);

    // When: the exact same payload is pushed again
    const response = await push(body(link));

    // Then: 201 again, still exactly one row, title refreshed in place
    expect(response.statusCode).toBe(201);
    const after = await prisma.feedItem.findMany({
      where: { guid: { startsWith: `https://push.example/${tag}/` } },
    });
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(before[0]?.id);
  });

  it("ING-01: a new link under the same source creates a second distinct row", async () => {
    // Given: the source from previous pushes
    // When: a payload with a fresh link is pushed
    const link = `https://push.example/${tag}/item-2`;
    const response = await push(body(link));

    // Then: 201 and the source now owns two items
    expect(response.statusCode).toBe(201);
    const source = await prisma.feedSource.findFirstOrThrow({ where: { name: sourceName } });
    const count = await prisma.feedItem.count({ where: { feedId: source.id } });
    expect(count).toBe(2);
  });
});
