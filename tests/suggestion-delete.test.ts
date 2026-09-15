import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestSuggestion, createTestTicket } from "./helpers.js";

/**
 * TASK-SYNCDEL — DELETE /tickets/suggestions/:id.
 * PENDING and REJECTED suggestions are deletable (204); an ACCEPTED one is
 * frozen audit material (422 VALIDATION); an unknown id is 404. The delete
 * appends a SUGGESTION_DELETED activity entry with the JSON detail
 * {field, value≤500, decision:"deleted"} and never touches earlier decision
 * rows — the audit trail is append-only, so a rejected-then-deleted
 * suggestion keeps its SUGGESTION_REJECTED entry.
 */

describe("DELETE /tickets/suggestions/:id (SUG-DEL)", () => {
  let app: FastifyInstance;
  let admin = "";

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
  });

  afterAll(async () => {
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  async function newSuggestion(
    suggestedValue: string,
  ): Promise<{ ticketId: string; suggestionId: string }> {
    const ticketId = await createTestTicket({ overview: "o" });
    const suggestionId = await createTestSuggestion(ticketId, {
      field: "overview",
      currentValue: null,
      suggestedValue,
    });
    return { ticketId, suggestionId };
  }

  it("SUG-DEL-01: a PENDING suggestion deletes with 204 and records SUGGESTION_DELETED", async () => {
    // Given: a PENDING overview suggestion
    const { ticketId, suggestionId } = await newSuggestion("AI overview text");

    // When: it is deleted
    const res = await app.inject({
      method: "DELETE",
      url: `/tickets/suggestions/${suggestionId}`,
      headers: { authorization: admin },
    });

    // Then: 204 no body, the row is gone, and the audit entry carries the
    // JSON decision detail
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(await prisma.aiSuggestion.findFirst({ where: { id: suggestionId } })).toBeNull();
    const entries = await prisma.ticketActivity.findMany({
      where: { ticketId, action: "SUGGESTION_DELETED" },
    });
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0]?.detail ?? "null")).toEqual({
      field: "overview",
      value: "AI overview text",
      decision: "deleted",
    });
    await cleanupTicket(ticketId);
  });

  it("SUG-DEL-02: an ACCEPTED suggestion is 422 VALIDATION and survives", async () => {
    // Given: a suggestion the analyst already accepted
    const { ticketId, suggestionId } = await newSuggestion("merged text");
    await prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: { status: "ACCEPTED" },
    });

    // When: the delete is attempted
    const res = await app.inject({
      method: "DELETE",
      url: `/tickets/suggestions/${suggestionId}`,
      headers: { authorization: admin },
    });

    // Then: 422 VALIDATION and the row stays (audit material)
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    expect(await prisma.aiSuggestion.findFirst({ where: { id: suggestionId } })).not.toBeNull();
    await cleanupTicket(ticketId);
  });

  it("SUG-DEL-03: an unknown suggestion id is 404 NOT_FOUND", async () => {
    // Given: no suggestion with this id exists
    const missing = "00000000-0000-4000-8000-000000000000";

    // When: the delete is attempted
    const res = await app.inject({
      method: "DELETE",
      url: `/tickets/suggestions/${missing}`,
      headers: { authorization: admin },
    });

    // Then: 404 NOT_FOUND
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("SUG-DEL-04: rejected-then-deleted keeps the earlier REJECTED row (history append-only)", async () => {
    // Given: a suggestion rejected through the API
    const { ticketId, suggestionId } = await newSuggestion("reject me");
    const rejected = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/suggestions/${suggestionId}/reject`,
      headers: { authorization: admin },
    });
    expect(rejected.statusCode).toBe(200);

    // When: the rejected suggestion is deleted
    const res = await app.inject({
      method: "DELETE",
      url: `/tickets/suggestions/${suggestionId}`,
      headers: { authorization: admin },
    });

    // Then: 204 and BOTH audit rows remain — the earlier REJECTED decision
    // is never rewritten by the later delete
    expect(res.statusCode).toBe(204);
    const actions = await prisma.ticketActivity.findMany({
      where: { ticketId },
      select: { action: true, detail: true },
      orderBy: { createdAt: "asc" },
    });
    expect(actions.map((entry) => entry.action)).toEqual(["SUGGESTION_REJECTED", "SUGGESTION_DELETED"]);
    expect(JSON.parse(actions[1]?.detail ?? "null")).toEqual({
      field: "overview",
      value: "reject me",
      decision: "deleted",
    });
    await cleanupTicket(ticketId);
  });

  it("SUG-DEL-05: the audit value is capped at 500 chars", async () => {
    // Given: a suggestion whose suggested value is 600 chars long
    const { ticketId, suggestionId } = await newSuggestion("x".repeat(600));

    // When: it is deleted
    const res = await app.inject({
      method: "DELETE",
      url: `/tickets/suggestions/${suggestionId}`,
      headers: { authorization: admin },
    });

    // Then: the stored detail value is truncated to 500 chars
    expect(res.statusCode).toBe(204);
    const entries = await prisma.ticketActivity.findMany({
      where: { ticketId, action: "SUGGESTION_DELETED" },
    });
    const detail = JSON.parse(entries[0]?.detail ?? "null") as { value: string };
    expect(detail.value).toHaveLength(500);
    await cleanupTicket(ticketId);
  });

  it("SUG-DEL-06: a malformed suggestion id is 400 VALIDATION", async () => {
    // When: the id is not a uuid
    const res = await app.inject({
      method: "DELETE",
      url: "/tickets/suggestions/not-a-uuid",
      headers: { authorization: admin },
    });

    // Then: schema validation answers 400 VALIDATION
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
  });
});
