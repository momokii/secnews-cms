import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket } from "./helpers.js";

/**
 * TASK-SYNCDEL — GET /tickets/:id/activity?action=<TicketActivityAction>.
 * The optional filter narrows the timeline to one action; an unknown action
 * is schema-rejected with 400 VALIDATION.
 */

describe("GET /tickets/:id/activity?action=… (ACT-FILTER)", () => {
  let app: FastifyInstance;
  let admin = "";
  let ticketId = "";

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
    ticketId = await createTestTicket({ overview: "o" });
    await prisma.ticketActivity.createMany({
      data: [
        { ticketId, action: "FIELDS_UPDATED", detail: "seed fields 1" },
        { ticketId, action: "FIELDS_UPDATED", detail: "seed fields 2" },
        { ticketId, action: "IOC_ADDED", detail: "seed ioc 1" },
        { ticketId, action: "SUGGESTION_DELETED", detail: "seed del 1" },
      ],
    });
  });

  afterAll(async () => {
    await cleanupTicket(ticketId);
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  async function list(query: string): Promise<{
    statusCode: number;
    body: { items: Array<{ action: string }>; total: number } | { error: { code: string } };
  }> {
    const res = await app.inject({
      method: "GET",
      url: `/tickets/${ticketId}/activity${query}`,
      headers: { authorization: admin },
    });
    return { statusCode: res.statusCode, body: res.body === "" ? { items: [], total: 0 } : res.json() };
  }

  it("ACT-F-01: ?action=IOC_ADDED narrows the timeline to that action", async () => {
    // Given: a ticket with entries across three actions
    // When: the timeline is filtered to IOC_ADDED
    const res = await list("?action=IOC_ADDED");

    // Then: only the matching entries come back and the total matches them
    expect(res.statusCode).toBe(200);
    const body = res.body as { items: Array<{ action: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.items.map((entry) => entry.action)).toEqual(["IOC_ADDED"]);
  });

  it("ACT-F-02: ?action=SUGGESTION_DELETED returns the new action type", async () => {
    // When: the timeline is filtered to SUGGESTION_DELETED
    const res = await list("?action=SUGGESTION_DELETED");

    // Then: the enum value is accepted and matched
    expect(res.statusCode).toBe(200);
    const body = res.body as { items: Array<{ action: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0]?.action).toBe("SUGGESTION_DELETED");
  });

  it("ACT-F-03: an unknown action is 400 VALIDATION", async () => {
    // When: the filter value is not a TicketActivityAction
    const res = await list("?action=NOT_A_REAL_ACTION");

    // Then: schema validation rejects it before any read
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe("VALIDATION");
  });

  it("ACT-F-04: without the filter the full timeline is returned", async () => {
    // When: no action filter is sent
    const res = await list("");

    // Then: every entry is returned
    expect(res.statusCode).toBe(200);
    expect((res.body as { total: number }).total).toBe(4);
  });
});
