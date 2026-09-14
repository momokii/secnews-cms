import { useState } from "react";
import { Link, useParams } from "react-router";
import type { TicketStatus } from "../../lib/ticketsApi";
import { type TransitionRole } from "../../lib/ticketState";
import { getUser } from "../../lib/tokenStore";
import { useQueryClient } from "@tanstack/react-query";
import { useTicket, useTransitionTicket } from "../../lib/useTickets";
import { AiPanel } from "./AiPanel";
import { AuditTimeline } from "./AuditTimeline";
import { DeliveryActions } from "./DeliveryActions";
import { FinalFieldsForm } from "./FinalFieldsForm";
import { IocTable } from "./IocTable";
import { SourcesEditor } from "./SourcesEditor";
import { TransitionActionBar } from "./TransitionActionBar";

const STATUS_BADGE_CLASSES: Readonly<Record<TicketStatus, string>> = {
  OPEN: "bg-slate-100 text-slate-700",
  RESEARCH: "bg-amber-100 text-amber-700",
  READY: "bg-indigo-100 text-indigo-700",
  SENT: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-slate-200 text-slate-600",
};

/** Ticket workspace: action bar per state/role, final fields, AI review with
 * the S2 hard-block banner, send/OTX (disabled while blocked), sources,
 * IOC table and the delivery audit trail. */
export function TicketDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const ticketQuery = useTicket(id);
  const transition = useTransitionTicket();
  // 409 PENDING_SUGGESTIONS from any delivery action keeps the banner + gates
  // up until the ticket refetch reports zero pending suggestions.
  const [blockedByError, setBlockedByError] = useState(false);

  const ticket = ticketQuery.data;
  const role: TransitionRole | null = getUser()?.role ?? null;

  const onTransition = (to: TicketStatus): void => {
    transition.mutate({ id, to });
  };
  const onBlocked = (): void => {
    setBlockedByError(true);
    void queryClient.invalidateQueries({ queryKey: ["ticket", id] });
  };

  if (ticketQuery.isPending) {
    return (
      <p className="text-sm text-slate-500">Loading ticket…</p>
    );
  }
  if (ticketQuery.isError || ticket === undefined) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p role="alert" className="text-sm text-red-600">
          {ticketQuery.error instanceof Error
            ? ticketQuery.error.message
            : "Failed to load ticket."}
        </p>
        <Link to="/tickets" className="mt-3 inline-block text-sm text-indigo-600 hover:text-indigo-500">
          Back to tickets
        </Link>
      </section>
    );
  }

  const blocked = blockedByError || ticket.pendingSuggestions > 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{ticket.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[ticket.status]}`}
              >
                {ticket.status}
              </span>
              <span>{ticket.origin}</span>
              <span>·</span>
              <span>{ticket.findingType}</span>
              <span>·</span>
              <span>TLP {ticket.tlp}</span>
              {ticket.cveIds.length > 0 ? (
                <>
                  <span>·</span>
                  <span>{ticket.cveIds.join(", ")}</span>
                </>
              ) : null}
              {ticket.threatName !== null ? (
                <>
                  <span>·</span>
                  <span>{ticket.threatName}</span>
                </>
              ) : null}
            </p>
          </div>
          <TransitionActionBar
            status={ticket.status}
            role={role}
            onTransition={onTransition}
            pending={transition.isPending}
          />
        </div>

        <div className="mt-4">
          <DeliveryActions
            ticketId={ticket.id}
            status={ticket.status}
            blocked={blocked}
            onBlocked={onBlocked}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FinalFieldsForm ticket={ticket} />
        <AiPanel
          ticketId={ticket.id}
          pendingSuggestions={ticket.pendingSuggestions}
          blocked={blockedByError}
        />
      </div>

      <SourcesEditor ticketId={ticket.id} sources={ticket.sources} />
      <IocTable ticketId={ticket.id} iocs={ticket.iocs} />
      <AuditTimeline ticketId={ticket.id} />
    </div>
  );
}
