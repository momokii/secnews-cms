import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import {
  bearer,
  c3Cleanup,
  c3FeedItem,
  c3Ticket,
  c3User,
  type C3User,
} from "./tickets.fixtures.js";

/** TASK-ACT: every change appends a TicketActivity row; GET /tickets/:id/activity reads them. */

describe("GET /tickets/:id/activity (ACT-01)", () => {
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

  type ActivityList = {
    statusCode: number;
    body: { items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number };
  };

  async function inject(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    payload?: unknown,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method,
      url,
      headers: payload === undefined
        ? { authorization: bearer(admin, app) }
        : { authorization: bearer(admin, app), "content-type": "application/json" },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
    const body = res.body === "" ? {} : (res.json() as Record<string, unknown>);
    return { statusCode: res.statusCode, body };
  }

  function first(items: Array<Record<string, unknown>>): Record<string, unknown> {
    const entry = items[0];
    if (entry === undefined) {
      throw new Error("expected an activity entry");
    }
    return entry;
  }

  /** PATCH /:id/fields, then return the newest FIELDS_UPDATED detail parsed. */
  async function patchFields(
    ticketId: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const patched = await inject("PATCH", `/tickets/${ticketId}/fields`, payload);
    expect(patched.statusCode).toBe(200);
    const list = await activity(ticketId);
    const entry = first(list.body.items);
    expect(entry["action"]).toBe("FIELDS_UPDATED");
    const detail = entry["detail"];
    if (typeof detail !== "string") {
      throw new Error("expected a JSON-string detail");
    }
    return JSON.parse(detail);
  }

  async function activity(ticketId: string, query = ""): Promise<ActivityList> {
    const res = await inject("GET", `/tickets/${ticketId}/activity${query}`);
    return { statusCode: res.statusCode, body: res.body as ActivityList["body"] };
  }

  it("ACT-01: a transition writes a STATUS_CHANGED entry with actor name", async () => {
    // Given: an OPEN ticket
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);

    // When: OPEN → RESEARCH is transitioned, then the activity list is read
    const transitioned = await inject("POST", `/tickets/${ticket.id}/transition`, {
      to: "RESEARCH",
    });
    const list = await activity(ticket.id);

    // Then: the newest entry records the status change and the actor
    expect(transitioned.statusCode).toBe(200);
    expect(list.statusCode).toBe(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    const entry = first(list.body.items);
    expect(entry["action"]).toBe("STATUS_CHANGED");
    expect(entry["detail"]).toBe("status OPEN→RESEARCH");
    expect(entry["actorId"]).toBe(admin.id);
    expect(entry["actorName"]).toBe(`C3 ADMIN`);
  });

  it("ACT-01: a final-fields PATCH records per-field from→to values", async () => {
    // Given: an OPEN ticket (overview null, tlp at its AMBER default)
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);

    // When: overview + tlp are patched
    const changes = await patchFields(ticket.id, {
      overview: "Malicious campaign overview",
      tlp: "GREEN",
    });

    // Then: the detail parses to a per-field {from,to} map with old values
    expect(changes).toEqual({
      overview: { from: null, to: "Malicious campaign overview" },
      tlp: { from: "AMBER", to: "GREEN" },
    });
  });

  it("ACT-01: unchanged fields are absent from the FIELDS_UPDATED detail", async () => {
    // Given: an OPEN ticket with tlp at its AMBER default
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);

    // When: title changes but tlp is patched to its current value
    const changes = await patchFields(ticket.id, { title: `${ticket.title} v2`, tlp: "AMBER" });

    // Then: only the actually-changed title carries a from→to pair
    expect(changes).toEqual({ title: { from: ticket.title, to: `${ticket.title} v2` } });
  });

  it("ACT-01: detail values are truncated to 500 chars and arrays joined", async () => {
    // Given: an OPEN ticket
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);

    // When: a 600-char overview and a two-element references list are patched
    const changes = await patchFields(ticket.id, {
      overview: "x".repeat(600),
      references: ["https://example.com/a", "https://example.com/b"],
    });

    // Then: text is capped at 500 chars; arrays are joined with ", "
    expect(changes).toEqual({
      overview: { from: null, to: "x".repeat(500) },
      references: { from: "", to: "https://example.com/a, https://example.com/b" },
    });
  });

  it("ACT-02: the activity list is paginated and ordered newest first", async () => {
    // Given: a ticket with three seeded entries at distinct timestamps
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);
    const base = Date.now();
    await prisma.ticketActivity.createMany({
      data: [0, 1, 2].map((index) => ({
        ticketId: ticket.id,
        action: "FIELDS_UPDATED",
        detail: `seed ${index}`,
        createdAt: new Date(base + index * 1000),
      })),
    });

    // When: the second page of size 2 is requested
    const page1 = await activity(ticket.id, "?page=1&pageSize=2");
    const page2 = await activity(ticket.id, "?page=2&pageSize=2");

    // Then: totals hold, newest comes first, and the pages do not overlap
    expect(page1.body.total).toBe(3);
    expect(page1.body.items).toHaveLength(2);
    expect(first(page1.body.items)["detail"]).toBe("seed 2");
    expect(page1.body.items[1]?.["detail"]).toBe("seed 1");
    expect(page2.body.items).toHaveLength(1);
    expect(first(page2.body.items)["detail"]).toBe("seed 0");
  });

  it("ACT-01: a manual create writes a CREATED entry", async () => {
    // When: a manual ticket is created through the API
    const created = await inject("POST", "/tickets", {
      findingType: "OTHER",
      title: `activity-manual-${randomUUID()}`,
    });
    const ticketId = (created.body as { id: string }).id;
    ticketIds.push(ticketId);
    const list = await activity(ticketId);

    // Then: a CREATED entry with the creator as actor exists
    expect(created.statusCode).toBe(201);
    expect(list.body.items).toHaveLength(1);
    expect(first(list.body.items)["action"]).toBe("CREATED");
    expect(first(list.body.items)["actorName"]).toBe(`C3 ADMIN`);
  });

  it("ACT-01: taking a feed item writes a TAKEN-from-feed entry", async () => {
    // Given: an UNREVIEWED feed item
    const item = await c3FeedItem("UNREVIEWED");
    feedItemIds.push(item.itemId);
    feedSourceIds.push(item.sourceId);

    // When: the item is taken
    const taken = await inject("POST", `/feed-items/${item.itemId}/take`);
    const ticketId = (taken.body as { id: string }).id;
    ticketIds.push(ticketId);
    const list = await activity(ticketId);

    // Then: the spawned ticket carries a TAKEN entry referencing the feed
    expect(taken.statusCode).toBe(201);
    expect(taken.body["takenByName"]).toBe("C3 ADMIN");
    expect(list.body.items).toHaveLength(1);
    expect(first(list.body.items)["action"]).toBe("TAKEN");
    expect(first(list.body.items)["detail"]).toBe("taken from feed");
  });

  it("ACT-01: IOC add, update and remove write entries", async () => {
    // Given: an OPEN ticket
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);

    // When: an IOC is added, patched, then removed
    const added = await inject("POST", `/tickets/${ticket.id}/iocs`, {
      type: "DOMAIN",
      value: "evil.example",
      includeInBulletin: true,
    });
    const iocId = (added.body as { id: string }).id;
    await inject("PATCH", `/tickets/${ticket.id}/iocs/${iocId}`, { value: "worse.example" });
    const removed = await inject("DELETE", `/tickets/${ticket.id}/iocs/${iocId}`);
    const list = await activity(ticket.id);
    const actions = list.body.items.map((entry) => entry["action"]);

    // Then: three IOC entries exist in reverse-chronological order
    expect(removed.statusCode).toBe(204);
    expect(actions).toEqual(["IOC_REMOVED", "IOC_UPDATED", "IOC_ADDED"]);
    expect(first(list.body.items)["detail"]).toContain("worse.example");
    expect(list.body.items[2]?.["detail"]).toContain("evil.example");
  });

  it("ACT-01: source add and remove write entries", async () => {
    // Given: an OPEN ticket
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);

    // When: a source is added then removed
    const added = await inject("POST", `/tickets/${ticket.id}/sources`, {
      url: "https://example.com/advisory",
    });
    const sourceId = (added.body as { id: string }).id;
    const removed = await inject("DELETE", `/tickets/${ticket.id}/sources/${sourceId}`);
    const list = await activity(ticket.id);
    const actions = list.body.items.map((entry) => entry["action"]);

    // Then: SOURCE_ADDED and SOURCE_REMOVED entries exist
    expect(removed.statusCode).toBe(204);
    expect(actions).toEqual(["SOURCE_REMOVED", "SOURCE_ADDED"]);
    expect(list.body.items[1]?.["detail"]).toContain("https://example.com/advisory");
  });

  it("ACT-01: suggestion accept and reject write entries", async () => {
    // Given: an OPEN ticket with two PENDING suggestions for overview
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);
    const content = JSON.stringify({ field: "overview", suggestedValue: "AI text" });
    const suggestion = { ticketId: ticket.id, status: "PENDING" as const, content };
    const toAccept = await prisma.aiSuggestion.create({ data: suggestion, select: { id: true } });
    const toReject = await prisma.aiSuggestion.create({ data: suggestion, select: { id: true } });

    // When: one is accepted and the other rejected
    await inject("POST", `/tickets/${ticket.id}/suggestions/${toAccept.id}/accept`);
    await inject("POST", `/tickets/${ticket.id}/suggestions/${toReject.id}/reject`);
    const list = await activity(ticket.id);
    const actions = list.body.items.map((entry) => entry["action"]);

    // Then: both decisions are recorded, detail a JSON {field, value, decision}
    expect(actions).toEqual(["SUGGESTION_REJECTED", "SUGGESTION_ACCEPTED"]);
    expect(JSON.parse(String(list.body.items[1]?.["detail"]))).toEqual({
      field: "overview",
      value: "AI text",
      decision: "ACCEPTED",
    });
    expect(JSON.parse(String(list.body.items[0]?.["detail"]))).toEqual({
      field: "overview",
      value: "AI text",
      decision: "REJECTED",
    });
  });

  it("returns 401 without a token", async () => {
    // Given: an activity route and no authorization header
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);

    // When: the list is requested anonymously
    const res = await app.inject({ method: "GET", url: `/tickets/${ticket.id}/activity` });

    // Then: 401 UNAUTHORIZED
    expect(res.statusCode).toBe(401);
  });
});
