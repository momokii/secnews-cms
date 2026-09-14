import { useState } from "react";
import { ApiError } from "../../lib/api";
import type { TicketStatus } from "../../lib/ticketsApi";
import { usePushOtx } from "../../lib/useTickets";
import { SendDialog } from "./SendDialog";

/** Inline SVG spinner (DESIGN.md: inline SVG only) shown while a push runs. */
function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4 shrink-0 animate-spin"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface DeliveryActionsProps {
  ticketId: string;
  status: TicketStatus;
  /** S2 hard block: pending suggestions or a fresh 409. */
  blocked: boolean;
  /** Raised when either action comes back 409 PENDING_SUGGESTIONS. */
  onBlocked: () => void;
}

/** Send + OTX push triggers. Both require READY (else 422) and zero PENDING
 * suggestions (409 PENDING_SUGGESTIONS) — disabled up front when blocked. */
export function DeliveryActions({
  ticketId,
  status,
  blocked,
  onBlocked,
}: DeliveryActionsProps) {
  const [sendOpen, setSendOpen] = useState(false);
  const pushOtx = usePushOtx();
  const ready = status === "READY";
  const disabled = blocked || !ready;

  const push = (): void => {
    pushOtx.mutate(ticketId, {
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          onBlocked();
        }
      },
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setSendOpen(true)}
        disabled={disabled}
        title={ready ? undefined : "Only READY tickets can be sent"}
        className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        Send to channels
      </button>
      <button
        type="button"
        onClick={push}
        disabled={disabled || pushOtx.isPending}
        title={ready ? undefined : "Only READY tickets can be pushed to OTX"}
        className="rounded-md border border-indigo-600 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
      >
        {pushOtx.isPending ? (
          <>
            <Spinner />
            Pushing…
          </>
        ) : (
          "Push to OTX"
        )}
      </button>

      {sendOpen ? (
        <SendDialog
          open
          onClose={() => setSendOpen(false)}
          ticketId={ticketId}
          onBlocked={onBlocked}
        />
      ) : null}

      {pushOtx.data ? (
        <p role="status" className="text-sm text-slate-700">
          Pulse pushed —{" "}
          <a
            href={pushOtx.data.pulseUrl}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:text-indigo-500"
          >
            {pushOtx.data.pulseId}
          </a>{" "}
          (TLP {pushOtx.data.tlpMarking}, {pushOtx.data.isPublic ? "public" : "not public"})
        </p>
      ) : null}
      {pushOtx.isError && !blocked ? (
        <p role="alert" className="text-sm text-red-600">
          {pushOtx.error instanceof Error ? pushOtx.error.message : "OTX push failed."}
        </p>
      ) : null}
    </div>
  );
}
