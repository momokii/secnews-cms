import type { TicketStatus } from "../../lib/ticketsApi";
import { permittedTargets, type TransitionRole } from "../../lib/ticketState";

interface TransitionActionBarProps {
  status: TicketStatus;
  /** null when no session user is stored — renders no buttons. */
  role: TransitionRole | null;
  onTransition: (to: TicketStatus) => void;
  /** Disables every button while a transition request runs. */
  pending?: boolean;
}

/** Action-bar labels per target status (docs/STATES.md §1 machine). */
const TARGET_LABELS: Readonly<Record<TicketStatus, string>> = {
  OPEN: "Reopen",
  RESEARCH: "Start research",
  READY: "Mark ready",
  SENT: "Mark sent",
  CLOSED: "Close ticket",
};

/** Status workflow buttons: exactly the transitions `canTransition` permits —
 * illegal edges and role-gated edges are hidden, never disabled. */
export function TransitionActionBar({
  status,
  role,
  onTransition,
  pending = false,
}: TransitionActionBarProps) {
  if (role === null) return null;
  const targets = permittedTargets(role, status);
  if (targets.length === 0) return null;
  return (
    <div className="flex gap-2" aria-label="Transitions">
      {targets.map((to) => (
        <button
          key={to}
          type="button"
          disabled={pending}
          onClick={() => onTransition(to)}
          className={
            to === "CLOSED"
              ? "rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              : "rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          }
        >
          {TARGET_LABELS[to]}
        </button>
      ))}
    </div>
  );
}
