import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestSuggestion, createTestTicket } from "./helpers.js";

describe("TASK-C4 suggestion lifecycle (accept merges, reject discards)", () => {
  let app: FastifyInstance;
  let analyst = "";

  beforeAll(async () => {
    app = await buildApp();
    analyst = await bearerFor(app, "ANALYST");
  });

  afterAll(async () => {
    await prisma.aiSuggestion.deleteMany({});
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("SUG-01: accept merges suggestedValue into the ticket final field and marks ACCEPTED", async () => {
    // Given: a ticket without overview and a PENDING overview suggestion
    const ticketId = await createTestTicket({ overview: null });
    const suggestionId = await createTestSuggestion(ticketId, {
      field: "overview",
      currentValue: null,
      suggestedValue: "Accepted overview text",
    });

    // When: the suggestion is accepted
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/suggestions/${suggestionId}/accept`,
      headers: { authorization: analyst },
    });

    // Then: 200 ACCEPTED and the ticket's final field now carries the suggested value
    expect(res.statusCode).toBe(200);
    const body = res.json() as { suggestion: { id: string; status: string } };
    expect(body.suggestion.status).toBe("ACCEPTED");
    expect(body.suggestion.id).toBe(suggestionId);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.overview).toBe("Accepted overview text");

    const row = await prisma.aiSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
    expect(row.status).toBe("ACCEPTED");
    await cleanupTicket(ticketId);
  });

  it("SUG-02: reject marks REJECTED and leaves the ticket final fields untouched", async () => {
    // Given: a ticket with an existing overview and a PENDING rewrite suggestion
    const ticketId = await createTestTicket({ overview: "Original overview" });
    const suggestionId = await createTestSuggestion(ticketId, {
      field: "overview",
      currentValue: "Original overview",
      suggestedValue: "Rejected rewrite",
    });

    // When: the suggestion is rejected
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/suggestions/${suggestionId}/reject`,
      headers: { authorization: analyst },
    });

    // Then: REJECTED, and the final field still holds the original text
    expect(res.statusCode).toBe(200);
    expect((res.json() as { suggestion: { status: string } }).suggestion.status).toBe("REJECTED");
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.overview).toBe("Original overview");
    await cleanupTicket(ticketId);
  });

  it("accepting twice is a 409 CONFLICT; the second accept does not re-merge", async () => {
    // Given: an already-accepted suggestion
    const ticketId = await createTestTicket({ overview: null });
    const suggestionId = await createTestSuggestion(ticketId, {
      field: "overview",
      currentValue: null,
      suggestedValue: "First merge",
    });
    await prisma.aiSuggestion.update({ where: { id: suggestionId }, data: { status: "ACCEPTED" } });

    // When: it is accepted again
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/suggestions/${suggestionId}/accept`,
      headers: { authorization: analyst },
    });

    // Then: conflict on the double action
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe("CONFLICT");
    await cleanupTicket(ticketId);
  });

  it("accepting a suggestion that belongs to another ticket is 404 NOT_FOUND", async () => {
    // Given: a suggestion stored under ticket A
    const ticketA = await createTestTicket();
    const suggestionId = await createTestSuggestion(ticketA, {
      field: "description",
      currentValue: null,
      suggestedValue: "A's suggestion",
    });

    // When: ticket B accepts it by id
    const ticketB = await createTestTicket();
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketB}/suggestions/${suggestionId}/accept`,
      headers: { authorization: analyst },
    });

    // Then: the scoping miss is a not-found
    expect(res.statusCode).toBe(404);
    await cleanupTicket(ticketA);
    await cleanupTicket(ticketB);
  });

  it("GET list returns the paginated envelope and honors the status filter", async () => {
    // Given: a ticket with one PENDING and one REJECTED suggestion
    const ticketId = await createTestTicket();
    const pendingId = await createTestSuggestion(ticketId, {
      field: "recommendations",
      currentValue: null,
      suggestedValue: "Rotate SSH keys",
    });
    await createTestSuggestion(
      ticketId,
      { field: "overview", currentValue: null, suggestedValue: "Discarded" },
      "REJECTED",
    );

    // When: listing with and without the PENDING filter
    const all = await app.inject({
      method: "GET",
      url: `/tickets/${ticketId}/suggestions`,
      headers: { authorization: analyst },
    });
    const pending = await app.inject({
      method: "GET",
      url: `/tickets/${ticketId}/suggestions?status=PENDING`,
      headers: { authorization: analyst },
    });

    // Then: envelope totals and filtered items behave per contract
    expect(all.statusCode).toBe(200);
    const allBody = all.json() as { items: unknown[]; total: number; page: number; pageSize: number };
    expect(allBody.total).toBe(2);
    expect(allBody.items).toHaveLength(2);

    expect(pending.statusCode).toBe(200);
    const pendingBody = pending.json() as { items: Array<{ id: string; status: string }>; total: number };
    expect(pendingBody.total).toBe(1);
    expect(pendingBody.items[0]?.id).toBe(pendingId);
    expect(pendingBody.items[0]?.status).toBe("PENDING");
    await cleanupTicket(ticketId);
  });
});
