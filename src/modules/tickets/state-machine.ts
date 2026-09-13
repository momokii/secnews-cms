import type { Role } from "../../generated/prisma/enums.js";
import type { TicketStatus } from "./schema.js";

/**
 * Ticket status machine, pinned verbatim to docs/STATES.md §1.
 * Forward-only edges plus the cancel path into CLOSED; CLOSED is terminal.
 */

export const TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  OPEN: ["RESEARCH", "CLOSED"],
  RESEARCH: ["READY", "CLOSED"],
  READY: ["SENT", "CLOSED"],
  SENT: ["CLOSED"],
  CLOSED: [],
};

export function isLegalTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Role gate for a legal edge (STATES.md role table); null when the edge
 * itself is illegal. Work edges: ADMIN/EDITOR/ANALYST; send (→SENT) and
 * close (→CLOSED): ADMIN/EDITOR. */
export function allowedRoles(from: TicketStatus, to: TicketStatus): readonly Role[] | null {
  if (!isLegalTransition(from, to)) {
    return null;
  }
  if (to === "SENT" || to === "CLOSED") {
    return ["ADMIN", "EDITOR"];
  }
  return ["ADMIN", "EDITOR", "ANALYST"];
}

/** Single predicate for the transition route: edge legality AND role gate. */
export function canTransition(role: Role, from: TicketStatus, to: TicketStatus): boolean {
  return allowedRoles(from, to)?.includes(role) ?? false;
}
