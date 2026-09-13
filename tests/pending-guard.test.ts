import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "../src/common/errors.js";
import { prisma } from "../src/lib/db.js";
import { assertNoPendingSuggestions } from "../src/lib/guards/pending.js";
import { cleanupTicket, createTestSuggestion, createTestTicket } from "./helpers.js";

describe("TASK-C4 hard-block guard (S2 / BLK-01)", () => {
  afterAll(async () => {
    await prisma.aiSuggestion.deleteMany({});
    await prisma.$disconnect();
  });

  it("BLK-01: blocks while PENDING suggestions exist, reporting the count", async () => {
    // Given: a ticket holding one PENDING AI suggestion
    const ticketId = await createTestTicket();
    await createTestSuggestion(ticketId, {
      field: "overview",
      currentValue: null,
      suggestedValue: "Unresolved proposal",
    });

    // When: the guard is consulted
    // Then: it raises the PENDING_SUGGESTIONS conflict with the pending count
    const error = await assertNoPendingSuggestions(prisma, ticketId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.code).toBe("PENDING_SUGGESTIONS");
    expect(appError.statusCode).toBe(409);
    expect(appError.details).toMatchObject({ pending: 1 });
    await cleanupTicket(ticketId);
  });

  it("BLK-01: passes once every suggestion is resolved (rejected)", async () => {
    // Given: a ticket whose only suggestion got rejected
    const ticketId = await createTestTicket();
    const suggestionId = await createTestSuggestion(
      ticketId,
      { field: "overview", currentValue: null, suggestedValue: "Resolved proposal" },
      "REJECTED",
    );

    // When: the guard is consulted
    // Then: it resolves without throwing
    await expect(assertNoPendingSuggestions(prisma, ticketId)).resolves.toBeUndefined();
    await cleanupTicket(ticketId);
    void suggestionId;
  });
});
