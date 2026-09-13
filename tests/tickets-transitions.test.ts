import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearer, c3Cleanup, c3Ticket, c3User, type C3User } from "./tickets.fixtures.js";

describe("POST /tickets/:id/transition (TRN-01, TRN-02)", () => {
  let app: FastifyInstance;
  let admin: C3User;
  let editor: C3User;
  let analyst: C3User;

  const ticketIds: string[] = [];
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    admin = await c3User("ADMIN");
    editor = await c3User("EDITOR");
    analyst = await c3User("ANALYST");
    emails.push(admin.email, editor.email, analyst.email);
  });

  afterAll(async () => {
    await c3Cleanup({ ticketIds, emails });
    await prisma.$disconnect();
  });

  async function transition(
    user: C3User,
    ticketId: string,
    to: string,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/transition`,
      headers: { authorization: bearer(user, app) },
      payload: { to },
    });
    return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
  }

  it("TRN-01: advances OPEN → RESEARCH → READY → SENT → CLOSED for ADMIN", async () => {
    // Given: an OPEN ticket and an ADMIN token
    const ticket = await c3Ticket({ status: "OPEN" });
    ticketIds.push(ticket.id);

    // When: each forward transition is requested in order
    const steps = ["RESEARCH", "READY", "SENT", "CLOSED"] as const;
    const statuses: string[] = [];
    for (const to of steps) {
      const res = await transition(admin, ticket.id, to);
      expect(res.statusCode).toBe(200);
      statuses.push((res.body as { status: string }).status);
    }

    // Then: the ticket walks the whole chain and lands CLOSED
    expect(statuses).toEqual(["RESEARCH", "READY", "SENT", "CLOSED"]);
  });

  it("TRN-01: cancels from OPEN, RESEARCH and READY straight to CLOSED", async () => {
    // Given: one ticket per cancellable origin state
    for (const from of ["OPEN", "RESEARCH", "READY"] as const) {
      const ticket = await c3Ticket({ status: from });
      ticketIds.push(ticket.id);

      // When: CLOSED is requested
      const res = await transition(admin, ticket.id, "CLOSED");

      // Then: the cancel path lands CLOSED
      expect(res.statusCode).toBe(200);
      expect((res.body as { status: string }).status).toBe("CLOSED");
    }
  });

  it("TRN-02: rejects READY→OPEN with 422 VALIDATION", async () => {
    // Given: a READY ticket
    const ticket = await c3Ticket({ status: "READY" });
    ticketIds.push(ticket.id);

    // When: a backward transition to OPEN is requested
    const res = await transition(admin, ticket.id, "OPEN");

    // Then: 422 with the VALIDATION code
    expect(res.statusCode).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("VALIDATION");
  });

  it("TRN-02: rejects CLOSED→anything and skipping/self transitions with 422", async () => {
    // Given: a CLOSED ticket and an OPEN ticket
    const closed = await c3Ticket({ status: "CLOSED" });
    const open = await c3Ticket({ status: "OPEN" });
    ticketIds.push(closed.id, open.id);

    // When: each illegal transition is requested
    const attempts = [
      { ticketId: closed.id, to: "RESEARCH" },
      { ticketId: closed.id, to: "CLOSED" },
      { ticketId: open.id, to: "READY" },
      { ticketId: open.id, to: "OPEN" },
    ];
    const codes: number[] = [];
    for (const attempt of attempts) {
      const res = await transition(admin, attempt.ticketId, attempt.to);
      codes.push(res.statusCode);
      expect((res.body as { error: { code: string } }).error.code).toBe("VALIDATION");
    }

    // Then: every illegal attempt is 422
    expect(codes).toEqual([422, 422, 422, 422]);
  });

  it("TRN-02: rejects SENT→READY with 422 (no backward transitions)", async () => {
    // Given: a SENT ticket
    const ticket = await c3Ticket({ status: "SENT" });
    ticketIds.push(ticket.id);

    // When: READY is requested
    const res = await transition(admin, ticket.id, "READY");

    // Then: 422 VALIDATION
    expect(res.statusCode).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("VALIDATION");
  });

  it("gates work transitions to ADMIN/EDITOR/ANALYST and send/close to ADMIN/EDITOR", async () => {
    // Given: tickets in the states each gate needs
    const forAnalystWork = await c3Ticket({ status: "OPEN" });
    const forAnalystSend = await c3Ticket({ status: "READY" });
    const forAnalystClose = await c3Ticket({ status: "READY" });
    const forEditorSend = await c3Ticket({ status: "READY" });
    ticketIds.push(forAnalystWork.id, forAnalystSend.id, forAnalystClose.id, forEditorSend.id);

    // When: each role attempts its allowed and forbidden moves
    const work = await transition(analyst, forAnalystWork.id, "RESEARCH");
    const sendDenied = await transition(analyst, forAnalystSend.id, "SENT");
    const closeDenied = await transition(analyst, forAnalystClose.id, "CLOSED");
    const editorSend = await transition(editor, forEditorSend.id, "SENT");

    // Then: WORK edges allow ANALYST; send/close edges deny ANALYST but allow EDITOR
    expect(work.statusCode).toBe(200);
    expect(sendDenied.statusCode).toBe(403);
    expect((sendDenied.body as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    expect(closeDenied.statusCode).toBe(403);
    expect(editorSend.statusCode).toBe(200);
  });

  it("rejects an unauthenticated transition with 401", async () => {
    // Given: an OPEN ticket and no token
    const ticket = await c3Ticket({ status: "OPEN" });
    ticketIds.push(ticket.id);

    // When: the transition is attempted anonymously
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticket.id}/transition`,
      payload: { to: "RESEARCH" },
    });

    // Then: 401 UNAUTHORIZED
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 for an unknown ticket id", async () => {
    // Given: a valid but nonexistent uuid
    const missing = randomUUID();

    // When: a transition targets it
    const res = await transition(admin, missing, "RESEARCH");

    // Then: 404 NOT_FOUND
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("hard-blocks READY→SENT with 409 PENDING_SUGGESTIONS until none remain (S2)", async () => {
    // Given: a READY ticket with one PENDING AI suggestion
    const ticket = await c3Ticket({ status: "READY" });
    ticketIds.push(ticket.id);
    const suggestion = await prisma.aiSuggestion.create({
      data: { ticketId: ticket.id, status: "PENDING", model: "test", content: "{}" },
      select: { id: true },
    });

    // When: SENT is requested, then the suggestion is resolved and SENT retried
    const blocked = await transition(admin, ticket.id, "SENT");
    await prisma.aiSuggestion.update({
      where: { id: suggestion.id },
      data: { status: "REJECTED" },
    });
    const retried = await transition(admin, ticket.id, "SENT");

    // Then: blocked with PENDING_SUGGESTIONS, then allowed after resolution
    expect(blocked.statusCode).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe("PENDING_SUGGESTIONS");
    expect(retried.statusCode).toBe(200);
    expect((retried.body as { status: string }).status).toBe("SENT");
  });
});
