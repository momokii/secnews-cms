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

  const body = (link: string, title: string = `ING push ${tag}`) => ({
    sourceName,
    title,
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

  it("ING-01: a new link with a distinct title creates a second distinct row", async () => {
    // Given: the source from previous pushes
    // When: a payload with a fresh link AND a distinct title is pushed
    // (same-title-same-source is deduped by ING-D, so distinctness needs a
    // new title too)
    const link = `https://push.example/${tag}/item-2`;
    const response = await push(body(link, `ING push ${tag} second`));

    // Then: 201 and the source now owns two items
    expect(response.statusCode).toBe(201);
    const source = await prisma.feedSource.findFirstOrThrow({ where: { name: sourceName } });
    const count = await prisma.feedItem.count({ where: { feedId: source.id } });
    expect(count).toBe(2);
  });
});

/** ING-D: a source never stores two items with the same (trimmed, case-exact)
 * title. Enforced at the shared store write path, not by a DB index. */
describe("POST /ingest title dedupe (ING-D-01, ING-D-02, ING-D-03)", () => {
  let app: FastifyInstance;
  const tag = randomUUID();
  const sourceName = `ingest-dedupe-${tag}`;
  const otherName = `ingest-dedupe-other-${tag}`;
  const apiKey = process.env["INGEST_API_KEY"] ?? "";

  const push = (payload: Record<string, unknown>, key: string = apiKey) =>
    app.inject({
      method: "POST",
      url: "/ingest",
      headers: key === "" ? {} : { "x-api-key": key },
      payload,
    });

  const body = (link: string, title: string) => ({
    sourceName,
    title,
    link,
    publishedAt: "2026-03-01T10:30:00.000Z",
    raw: {},
  });

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    const sources = await prisma.feedSource.findMany({
      where: { name: { in: [sourceName, otherName] } },
      select: { id: true },
    });
    await prisma.feedItem.deleteMany({ where: { feedId: { in: sources.map((s) => s.id) } } });
    await prisma.feedSource.deleteMany({ where: { id: { in: sources.map((s) => s.id) } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("ING-D-01: re-ingest with the same title but a different guid creates no row", async () => {
    // Given: a stored item with a unique title
    const title = `ING-D dupe ${tag}`;
    const first = await push(body(`https://push.example/${tag}/d-1`, title));
    expect(first.statusCode).toBe(201);

    // When: the same title is pushed again under a different guid
    const second = await push(body(`https://push.example/${tag}/d-2`, title));

    // Then: 201 idempotent and still exactly one row, owned by the first guid
    expect(second.statusCode).toBe(201);
    const source = await prisma.feedSource.findFirstOrThrow({ where: { name: sourceName } });
    const rows = await prisma.feedItem.findMany({ where: { feedId: source.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.guid).toBe(`https://push.example/${tag}/d-1`);
    expect(rows[0]?.title).toBe(title);
  });

  it("ING-D-02: the same title under a different source still creates a row", async () => {
    // Given: the ING-D-01 title already stored under sourceName
    const title = `ING-D dupe ${tag}`;

    // When: the same title is pushed from a different source name
    const response = await push({
      ...body(`https://push.example/${tag}/d-3`, title),
      sourceName: otherName,
    });

    // Then: 201 and the other source owns exactly one row of its own
    expect(response.statusCode).toBe(201);
    const other = await prisma.feedSource.findFirstOrThrow({ where: { name: otherName } });
    expect(await prisma.feedItem.count({ where: { feedId: other.id } })).toBe(1);
  });

  it("ING-D-03: title matching is trimmed and case-exact", async () => {
    // Given: a stored item titled "ING-D edge <tag>" (unpadded)
    const core = `ING-D edge ${tag}`;
    const source = await prisma.feedSource.findFirstOrThrow({ where: { name: sourceName } });
    const countRows = () => prisma.feedItem.count({ where: { feedId: source.id } });
    const seeded = await push(body(`https://push.example/${tag}/d-4`, core));
    expect(seeded.statusCode).toBe(201);
    const afterSeed = await countRows();

    // When: the same title arrives wrapped in whitespace under a fresh guid
    const padded = await push(body(`https://push.example/${tag}/d-5`, `  ${core}  `));

    // Then: trimmed match → skipped, row count unchanged
    expect(padded.statusCode).toBe(201);
    expect(await countRows()).toBe(afterSeed);

    // When: a case-variant title arrives under another fresh guid
    const cased = await push(body(`https://push.example/${tag}/d-6`, core.toUpperCase()));

    // Then: case differs → distinct title → exactly one new row
    expect(cased.statusCode).toBe(201);
    expect(await countRows()).toBe(afterSeed + 1);
  });
});
