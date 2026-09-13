import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/db.js";
import { bearer, c3Cleanup, c3FeedItem, c3Tag, c3User, type C3User } from "./tickets.fixtures.js";

describe("POST /feed-items/:id/take (TAKE-01, TAKE-02)", () => {
  let app: FastifyInstance;
  let analyst: C3User;

  const feedItemIds: string[] = [];
  const feedSourceIds: string[] = [];
  const ticketIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    analyst = await c3User("ANALYST");
  });

  afterAll(async () => {
    await c3Cleanup({ feedItemIds, feedSourceIds, ticketIds, emails: [analyst.email] });
    await prisma.$disconnect();
  });

  it("TAKE-01: takes an UNREVIEWED item into an OPEN AUTO_FEED ticket (S1 flow)", async () => {
    // Given: an UNREVIEWED feed item and a WORK-role token
    const { itemId, sourceId } = await c3FeedItem("UNREVIEWED");
    feedItemIds.push(itemId);
    feedSourceIds.push(sourceId);

    // When: the item is taken
    const res = await app.inject({
      method: "POST",
      url: `/feed-items/${itemId}/take`,
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: a 201 ticket spawns with AUTO_FEED origin and the item back-links it, now TAKEN
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      id: string;
      title: string;
      origin: string;
      status: string;
      feedItemId: string | null;
    };
    expect(body.origin).toBe("AUTO_FEED");
    expect(body.status).toBe("OPEN");
    expect(body.feedItemId).toBe(itemId);
    expect(body.title).toContain(c3Tag());
    ticketIds.push(body.id);

    const item = await prisma.feedItem.findUnique({ where: { id: itemId } });
    expect(item?.status).toBe("TAKEN");
    const ticket = await prisma.ticket.findUnique({ where: { feedItemId: itemId } });
    expect(ticket?.id).toBe(body.id);
  });

  it("TAKE-01b: takes a VIEWED item the same way", async () => {
    // Given: a VIEWED feed item
    const { itemId, sourceId } = await c3FeedItem("VIEWED");
    feedItemIds.push(itemId);
    feedSourceIds.push(sourceId);

    // When: the item is taken
    const res = await app.inject({
      method: "POST",
      url: `/feed-items/${itemId}/take`,
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: 201 and the item is TAKEN
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string };
    ticketIds.push(body.id);
    const item = await prisma.feedItem.findUnique({ where: { id: itemId } });
    expect(item?.status).toBe("TAKEN");
  });

  it("TAKE-02: rejects a double take with 409 CONFLICT", async () => {
    // Given: an item that has already been taken
    const { itemId, sourceId } = await c3FeedItem("UNREVIEWED");
    feedItemIds.push(itemId);
    feedSourceIds.push(sourceId);
    const first = await app.inject({
      method: "POST",
      url: `/feed-items/${itemId}/take`,
      headers: { authorization: bearer(analyst, app) },
    });
    expect(first.statusCode).toBe(201);
    ticketIds.push((first.json() as { id: string }).id);

    // When: the same item is taken again
    const second = await app.inject({
      method: "POST",
      url: `/feed-items/${itemId}/take`,
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: 409 with the CONFLICT envelope code
    expect(second.statusCode).toBe(409);
    expect((second.json() as { error: { code: string } }).error.code).toBe("CONFLICT");
  });

  it("rejects an unauthenticated take with 401", async () => {
    // Given: an item and no Authorization header
    const { itemId, sourceId } = await c3FeedItem("UNREVIEWED");
    feedItemIds.push(itemId);
    feedSourceIds.push(sourceId);

    // When: the take is attempted anonymously
    const res = await app.inject({ method: "POST", url: `/feed-items/${itemId}/take` });

    // Then: 401 with the UNAUTHORIZED envelope code
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 for an unknown feed item id", async () => {
    // Given: a valid but nonexistent uuid
    const missing = randomUUID();

    // When: that id is taken
    const res = await app.inject({
      method: "POST",
      url: `/feed-items/${missing}/take`,
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: 404 with the NOT_FOUND envelope code
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });
});
