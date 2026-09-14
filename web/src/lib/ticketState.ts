import type { TicketStatus } from "./ticketsApi";

/**
 * FE mirror of src/modules/tickets/state-machine.ts (docs/STATES.md §1).
 * Forward-only edges plus the cancel path into CLOSED; CLOSED is terminal.
 * Work edges: ADMIN/EDITOR/ANALYST; send (→SENT) and close (→CLOSED): ADMIN/EDITOR.
 */

export type TransitionRole = "ADMIN" | "EDITOR" | "ANALYST";

export const TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  OPEN: ["RESEARCH", "CLOSED"],
  RESEARCH: ["READY", "CLOSED"],
  READY: ["SENT", "CLOSED"],
  SENT: ["CLOSED"],
  CLOSED: [],
};

export function legalTargets(from: TicketStatus): readonly TicketStatus[] {
  return TRANSITIONS[from];
}

/** Role gate for a legal edge; null when the edge itself is illegal. */
export function allowedRoles(
  from: TicketStatus,
  to: TicketStatus,
): readonly TransitionRole[] | null {
  if (!legalTargets(from).includes(to)) {
    return null;
  }
  if (to === "SENT" || to === "CLOSED") {
    return ["ADMIN", "EDITOR"];
  }
  return ["ADMIN", "EDITOR", "ANALYST"];
}

/** Single predicate for the action bar: edge legality AND role gate. */
export function canTransition(
  role: TransitionRole,
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  return allowedRoles(from, to)?.includes(role) ?? false;
}

/** Targets the given role may move to from `from` — the action bar renders exactly these. */
export function permittedTargets(
  role: TransitionRole,
  from: TicketStatus,
): TicketStatus[] {
  return legalTargets(from).filter((to) => canTransition(role, from, to));
}
