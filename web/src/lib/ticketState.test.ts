import { describe, expect, it } from "vitest";
import { canTransition, legalTargets } from "./ticketState";
import type { TicketStatus } from "./ticketsApi";

describe("ticketState: legalTargets mirrors docs/STATES.md §1", () => {
  const CASES: Array<[TicketStatus, TicketStatus[]]> = [
    ["OPEN", ["RESEARCH", "CLOSED"]],
    ["RESEARCH", ["READY", "CLOSED"]],
    ["READY", ["SENT", "CLOSED"]],
    ["SENT", ["CLOSED"]],
    ["CLOSED", []],
  ];

  it.each(CASES)("lists the legal targets for %s", (from, expected) => {
    expect(legalTargets(from)).toEqual(expected);
  });
});

describe("ticketState: canTransition applies the role gate", () => {
  it("lets any work role move OPEN → RESEARCH", () => {
    expect(canTransition("ADMIN", "OPEN", "RESEARCH")).toBe(true);
    expect(canTransition("EDITOR", "OPEN", "RESEARCH")).toBe(true);
    expect(canTransition("ANALYST", "OPEN", "RESEARCH")).toBe(true);
  });

  it("lets any work role move RESEARCH → READY", () => {
    expect(canTransition("ANALYST", "RESEARCH", "READY")).toBe(true);
  });

  it("restricts READY → SENT to ADMIN and EDITOR", () => {
    expect(canTransition("ADMIN", "READY", "SENT")).toBe(true);
    expect(canTransition("EDITOR", "READY", "SENT")).toBe(true);
    expect(canTransition("ANALYST", "READY", "SENT")).toBe(false);
  });

  it("restricts the cancel path → CLOSED to ADMIN and EDITOR from every non-terminal state", () => {
    for (const from of ["OPEN", "RESEARCH", "READY", "SENT"] as const) {
      expect(canTransition("ADMIN", from, "CLOSED")).toBe(true);
      expect(canTransition("EDITOR", from, "CLOSED")).toBe(true);
      expect(canTransition("ANALYST", from, "CLOSED")).toBe(false);
    }
  });

  it("rejects illegal edges regardless of role", () => {
    expect(canTransition("ADMIN", "OPEN", "READY")).toBe(false);
    expect(canTransition("ADMIN", "RESEARCH", "SENT")).toBe(false);
    expect(canTransition("ADMIN", "SENT", "OPEN")).toBe(false);
    expect(canTransition("ADMIN", "CLOSED", "RESEARCH")).toBe(false);
  });
});
