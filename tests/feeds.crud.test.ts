import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";

/** FEED-01: sources CRUD lifecycle. FEED-02: duplicate url → 409 CONFLICT. */
describe("Feed sources CRUD (FEED-01, FEED-02)", () => {
  let app: FastifyInstance;
  const tag = randomUUID();
  const url = (n: string) => `https://feeds.example/${tag}/${n}.xml`;

  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await prisma.feedSource.deleteMany({ where: { url: { startsWith: `https://feeds.example/${tag}/` } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("FEED-01: creates a source and returns the wire shape", async () => {
    // Given: a valid source payload with a unique url
    // When: POST /feeds
    const response = await app.inject({
      method: "POST",
      url: "/feeds",
      payload: { name: `FEED-01 ${tag}`, url: url("one") },
    });

    // Then: 201 with uuid id, active defaulting to true, ISO datetimes
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(typeof body.id).toBe("string");
    expect(body.name).toBe(`FEED-01 ${tag}`);
    expect(body.url).toBe(url("one"));
    expect(body.active).toBe(true);
    expect(() => new Date(body.createdAt).toISOString()).not.toThrow();
    expect(() => new Date(body.updatedAt).toISOString()).not.toThrow();
    createdIds.push(body.id);
  });

  it("FEED-01: lists sources including the created one", async () => {
    // Given: one source exists (previous test)
    // When: GET /feeds
    const response = await app.inject({ method: "GET", url: "/feeds?page=1&pageSize=100" });

    // Then: paginated envelope containing our row
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(100);
    expect(body.total).toBeGreaterThanOrEqual(1);
    const ours = body.items.find((item: { id: string }) => item.id === createdIds[0]);
    expect(ours).toMatchObject({ name: `FEED-01 ${tag}`, url: url("one"), active: true });
  });

  it("FEED-01: patches name and toggles active off and back on", async () => {
    // Given: an existing source
    // When: PATCH with active=false, then PATCH with active=true
    const off = await app.inject({
      method: "PATCH",
      url: `/feeds/${createdIds[0]}`,
      payload: { name: `FEED-01 renamed ${tag}`, active: false },
    });
    const on = await app.inject({
      method: "PATCH",
      url: `/feeds/${createdIds[0]}`,
      payload: { active: true },
    });

    // Then: both patches return 200 with the toggled value
    expect(off.statusCode).toBe(200);
    expect(off.json()).toMatchObject({ name: `FEED-01 renamed ${tag}`, active: false });
    expect(on.statusCode).toBe(200);
    expect(on.json().active).toBe(true);
  });

  it("FEED-02: rejects a duplicate url with 409 CONFLICT", async () => {
    // Given: a source with url("one") already exists
    // When: POST another source with the same url
    const response = await app.inject({
      method: "POST",
      url: "/feeds",
      payload: { name: `FEED-02 dup ${tag}`, url: url("one") },
    });

    // Then: 409 with the canonical error envelope
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CONFLICT");
  });

  it("FEED-01: deletes a source, which then 404s on patch and delete", async () => {
    // Given: an existing source id
    // When: DELETE, then PATCH and DELETE on the same id
    const deleted = await app.inject({ method: "DELETE", url: `/feeds/${createdIds[0]}` });
    const patched = await app.inject({
      method: "PATCH",
      url: `/feeds/${createdIds[0]}`,
      payload: { active: false },
    });
    const deletedAgain = await app.inject({ method: "DELETE", url: `/feeds/${createdIds[0]}` });

    // Then: 204 then two 404 NOT_FOUND envelopes
    expect(deleted.statusCode).toBe(204);
    expect(patched.statusCode).toBe(404);
    expect(patched.json().error.code).toBe("NOT_FOUND");
    expect(deletedAgain.statusCode).toBe(404);
    expect(deletedAgain.json().error.code).toBe("NOT_FOUND");
  });

  it("FEED-02: rejects patching a second source onto a taken url with 409", async () => {
    // Given: two live sources with distinct urls
    const first = await app.inject({
      method: "POST",
      url: "/feeds",
      payload: { name: `FEED-02 A ${tag}`, url: url("a") },
    });
    const second = await app.inject({
      method: "POST",
      url: "/feeds",
      payload: { name: `FEED-02 B ${tag}`, url: url("b") },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    createdIds.push(first.json().id, second.json().id);

    // When: PATCH the second source onto the first source's url
    const response = await app.inject({
      method: "PATCH",
      url: `/feeds/${second.json().id}`,
      payload: { url: url("a") },
    });

    // Then: 409 CONFLICT
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CONFLICT");
  });
});
