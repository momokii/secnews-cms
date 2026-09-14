import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearer, c3Cleanup, c3FeedItem, c3Ticket, c3User, type C3User } from "./tickets.fixtures.js";

describe("ticket updated and taken-by fields", () => {
  let app: FastifyInstance;
  let admin: C3User;
  const ticketIds: string[] = [];
  const feedItemIds: string[] = [];
  const feedSourceIds: string[] = [];
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    admin = await c3User("ADMIN");
    emails.push(admin.email);
  });

  afterAll(async () => {
    await c3Cleanup({ ticketIds, feedItemIds, feedSourceIds, emails });
    await prisma.$disconnect();
  });

  it("returns a taken-by name for a ticket spawned by take", async () => {
    // Given: an available feed item and an authenticated actor
    const item = await c3FeedItem("UNREVIEWED");
    feedItemIds.push(item.itemId);
    feedSourceIds.push(item.sourceId);

    // When: the actor takes the feed item
    const response = await app.inject({
      method: "POST",
      url: `/feed-items/${item.itemId}/take`,
      headers: { authorization: bearer(admin, app) },
    });
    const body = response.json() as { id: string; takenByName: string | null };
    ticketIds.push(body.id);

    // Then: the response identifies the actor by name
    expect(response.statusCode).toBe(201);
    expect(body.takenByName).toBe("C3 ADMIN");
  });

  it("returns null taken-by and updatedAt for a manual ticket in the list", async () => {
    // Given: a manually-created ticket
    const ticket = await c3Ticket({ origin: "MANUAL" });
    ticketIds.push(ticket.id);

    // When: the ticket list is requested
    const response = await app.inject({
      method: "GET",
      url: `/tickets?q=${encodeURIComponent(ticket.title)}`,
      headers: { authorization: bearer(admin, app) },
    });
    const body = response.json() as {
      items: Array<{ id: string; updatedAt: string; takenByName: string | null }>;
    };
    const row = body.items.find((item) => item.id === ticket.id);

    // Then: the row has the existing timestamp and no take actor
    expect(response.statusCode).toBe(200);
    expect(row?.updatedAt).toEqual(expect.any(String));
    expect(row?.takenByName).toBeNull();
  });

  it("returns null taken-by in manual ticket detail", async () => {
    // Given: a manually-created ticket
    const ticket = await c3Ticket({ origin: "MANUAL" });
    ticketIds.push(ticket.id);

    // When: the ticket detail is requested
    const response = await app.inject({
      method: "GET",
      url: `/tickets/${ticket.id}`,
      headers: { authorization: bearer(admin, app) },
    });
    const body = response.json() as { takenByName: string | null };

    // Then: no actor is reported
    expect(response.statusCode).toBe(200);
    expect(body.takenByName).toBeNull();
  });
});
