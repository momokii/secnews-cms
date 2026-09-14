import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupUsers } from "./helpers.js";

/** FEED-01: sources CRUD lifecycle (contract #12–#15, MGR-only).
 * FEED-02: duplicate url → 409 CONFLICT. */
describe("Feed sources CRUD (FEED-01, FEED-02)", () => {
  let app: FastifyInstance;
  const tag = randomUUID();
  const url = (n: string) => `https://feeds.example/${tag}/${n}.xml`;
  let admin = "";

  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
  });

  afterAll(async () => {
    await prisma.feedSource.deleteMany({ where: { url: { startsWith: `https://feeds.example/${tag}/` } } });
    await cleanupUsers();
    await app.close();
    await prisma.$disconnect();
  });

  const inject = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: Record<string, unknown>) =>
    app.inject({
      method,
      url,
      headers: { authorization: admin },
      ...(payload === undefined ? {} : { payload }),
    });

  it("FEED-01: creates a source and returns the wire shape", async () => {
    // Given: a valid source payload with a unique url
    // When: POST /feeds
    const response = await inject("POST", "/feeds", { name: `FEED-01 ${tag}`, url: url("one") });

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
    const response = await inject("GET", "/feeds?page=1&pageSize=100");

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
    const off = await inject("PATCH", `/feeds/${createdIds[0]}`, { name: `FEED-01 renamed ${tag}`, active: false });
    const on = await inject("PATCH", `/feeds/${createdIds[0]}`, { active: true });

    // Then: both patches return 200 with the toggled value
    expect(off.statusCode).toBe(200);
    expect(off.json()).toMatchObject({ name: `FEED-01 renamed ${tag}`, active: false });
    expect(on.statusCode).toBe(200);
    expect(on.json().active).toBe(true);
  });

  it("FEED-02: rejects a duplicate url with 409 CONFLICT", async () => {
    // Given: a source with url("one") already exists
    // When: POST another source with the same url
    const response = await inject("POST", "/feeds", { name: `FEED-02 dup ${tag}`, url: url("one") });

    // Then: 409 with the canonical error envelope
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CONFLICT");
  });

  it("FEED-01: deletes a source, which then 404s on patch and delete", async () => {
    // Given: an existing source id
    // When: DELETE, then PATCH and DELETE on the same id
    const deleted = await inject("DELETE", `/feeds/${createdIds[0]}`);
    const patched = await inject("PATCH", `/feeds/${createdIds[0]}`, { active: false });
    const deletedAgain = await inject("DELETE", `/feeds/${createdIds[0]}`);

    // Then: 204 then two 404 NOT_FOUND envelopes
    expect(deleted.statusCode).toBe(204);
    expect(patched.statusCode).toBe(404);
    expect(patched.json().error.code).toBe("NOT_FOUND");
    expect(deletedAgain.statusCode).toBe(404);
    expect(deletedAgain.json().error.code).toBe("NOT_FOUND");
  });

  it("FEED-02: rejects patching a second source onto a taken url with 409", async () => {
    // Given: two live sources with distinct urls
    const first = await inject("POST", "/feeds", { name: `FEED-02 A ${tag}`, url: url("a") });
    const second = await inject("POST", "/feeds", { name: `FEED-02 B ${tag}`, url: url("b") });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    createdIds.push(first.json().id, second.json().id);

    // When: PATCH the second source onto the first source's url
    const response = await inject("PATCH", `/feeds/${second.json().id}`, { url: url("a") });

    // Then: 409 CONFLICT
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CONFLICT");
  });

  it("RBAC: POST /feeds is 401 anonymous and 403 for ANALYST (#12–#15 MGR)", async () => {
    // Given: an analyst token
    const analyst = await bearerFor(app, "ANALYST");

    // When: the analyst and an anonymous caller attempt a create
    const worker = await app.inject({
      method: "POST",
      url: "/feeds",
      headers: { authorization: analyst },
      payload: { name: `FEED RBAC ${tag}`, url: url("rbac") },
    });
    const anon = await app.inject({ method: "POST", url: "/feeds", payload: { name: "x", url: url("anon") } });

    // Then: 403 FORBIDDEN, 401 UNAUTHORIZED
    expect(worker.statusCode).toBe(403);
    expect(worker.json().error.code).toBe("FORBIDDEN");
    expect(anon.statusCode).toBe(401);
  });
});
