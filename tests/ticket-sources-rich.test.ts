import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { TicketSourceSchema } from "../src/modules/tickets/schema.js";
import { bearer, c3Cleanup, c3Ticket, c3User, type C3User } from "./tickets.fixtures.js";

/** SRC-02: rich ticket sources — non-URL sources with a title label and
 * long-form analyst notes (POST), in-place edits (PATCH), and payload caps. */
describe("Ticket sources revamp (SRC-02)", () => {
  let app: FastifyInstance;
  let analyst: C3User;

  const ticketIds: string[] = [];
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    analyst = await c3User("ANALYST");
    emails.push(analyst.email);
  });

  afterAll(async () => {
    await c3Cleanup({ ticketIds, emails });
    await prisma.$disconnect();
  });

  function auth(user: C3User): { authorization: string } {
    return { authorization: bearer(user, app) };
  }

  it("creates a non-URL source with title + long notes and persists both", async () => {
    // Given: a ticket and a WORK token
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);
    const longNotes = "Full analyst write-up: ".repeat(40).trim(); // ~1100 chars, well within 5000

    // When: a source with only a title label and rich notes is posted
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticket.id}/sources`,
      headers: auth(analyst),
      payload: { title: "Slack thread #incident-42", notes: longNotes },
    });

    // Then: 201 with title + notes persisted and url null, and the detail
    // endpoint returns the same fields
    expect(res.statusCode).toBe(201);
    const body = TicketSourceSchema.parse(res.json());
    expect(body.url).toBeNull();
    expect(body.title).toBe("Slack thread #incident-42");
    expect(body.notes).toBe(longNotes);
    const detail = await app.inject({
      method: "GET",
      url: `/tickets/${ticket.id}`,
      headers: auth(analyst),
    });
    const stored = TicketSourceSchema.parse(
      (detail.json() as { sources: unknown[] }).sources[0],
    );
    expect(stored.title).toBe("Slack thread #incident-42");
    expect(stored.notes).toBe(longNotes);
  });

  it("PATCHes title, url, and notes on an existing source", async () => {
    // Given: a ticket with a note-only source
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);
    const created = await app.inject({
      method: "POST",
      url: `/tickets/${ticket.id}/sources`,
      headers: auth(analyst),
      payload: { note: "draft note" },
    });
    const sourceId = TicketSourceSchema.parse(created.json()).id;
    const updatedNotes = "Rewritten after review — full context recorded here.";

    // When: title, url, and notes are patched (empty patch and unknown id too)
    const patched = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticket.id}/sources/${sourceId}`,
      headers: auth(analyst),
      payload: { title: "Vendor PDF", url: "https://example.com/advisory.pdf", notes: updatedNotes },
    });
    const emptyPatch = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticket.id}/sources/${sourceId}`,
      headers: auth(analyst),
      payload: {},
    });
    const missing = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticket.id}/sources/00000000-0000-4000-8000-000000000000`,
      headers: auth(analyst),
      payload: { title: "x" },
    });

    // Then: 200 with all fields persisted via detail; empty patch 400; unknown 404
    expect(patched.statusCode).toBe(200);
    const body = TicketSourceSchema.parse(patched.json());
    expect(body.title).toBe("Vendor PDF");
    expect(body.url).toBe("https://example.com/advisory.pdf");
    expect(body.notes).toBe(updatedNotes);
    const detail = await app.inject({
      method: "GET",
      url: `/tickets/${ticket.id}`,
      headers: auth(analyst),
    });
    const stored = TicketSourceSchema.parse(
      (detail.json() as { sources: unknown[] }).sources[0],
    );
    expect(stored.notes).toBe(updatedNotes);
    expect(emptyPatch.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("rejects notes over 5000 chars and a malformed url with 400", async () => {
    // Given: a ticket
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);

    // When: notes exceed the 5000-char cap, and a garbage url is posted
    const tooLong = await app.inject({
      method: "POST",
      url: `/tickets/${ticket.id}/sources`,
      headers: auth(analyst),
      payload: { title: "x", notes: "a".repeat(5001) },
    });
    const badUrl = await app.inject({
      method: "POST",
      url: `/tickets/${ticket.id}/sources`,
      headers: auth(analyst),
      payload: { url: "not-a-url", title: "x" },
    });

    // Then: both are 400 VALIDATION
    expect(tooLong.statusCode).toBe(400);
    expect((tooLong.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    expect(badUrl.statusCode).toBe(400);
    expect((badUrl.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
  });
});
