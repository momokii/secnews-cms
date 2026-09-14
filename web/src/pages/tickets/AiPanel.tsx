import type { AiSuggestion } from "../../lib/ticketsApi";
import {
  useAcceptSuggestion,
  useAiEnrich,
  useAiFill,
  useRejectSuggestion,
  useSuggestions,
} from "../../lib/useTickets";

interface AiPanelProps {
  ticketId: string;
  /** From TicketDetail.pendingSuggestions — the S2 hard-block FE signal. */
  pendingSuggestions: number;
  /** Set when a delivery mutation came back 409 PENDING_SUGGESTIONS. */
  blocked: boolean;
}

const BADGE_CLASSES: Readonly<Record<AiSuggestion["status"], string>> = {
  PENDING: "bg-amber-100 text-amber-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-slate-100 text-slate-700",
};

/** AI assist: strict fill / full enrich, suggestion review with PENDING
 * badges + accept/reject, and the S2 hard-block banner. */
export function AiPanel({ ticketId, pendingSuggestions, blocked }: AiPanelProps) {
  const fill = useAiFill();
  const enrich = useAiEnrich();
  const suggestionsQuery = useSuggestions(ticketId);
  const accept = useAcceptSuggestion();
  const reject = useRejectSuggestion();

  const deliveryBlocked = blocked || pendingSuggestions > 0;
  const suggestions = suggestionsQuery.data?.items ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">AI assist</h2>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => fill.mutate(ticketId)}
            disabled={fill.isPending || enrich.isPending}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            AI fill (strict)
          </button>
          <button
            type="button"
            onClick={() => enrich.mutate(ticketId)}
            disabled={fill.isPending || enrich.isPending}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            AI enrich
          </button>
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Fill: drafts Overview/Description/etc. ONLY from this ticket's materials
        (never invents facts). Enrich: researches extra context first; every
        addition lands as a reviewable suggestion you must Accept/Edit/Reject —
        sending is blocked while any is pending.
      </p>

      {deliveryBlocked ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {blocked
            ? "Send and OTX push are blocked: unresolved AI suggestions remain. Review them below."
            : `${pendingSuggestions} unresolved AI suggestion${pendingSuggestions === 1 ? "" : "s"} block Send and OTX push. Review them below.`}
        </p>
      ) : null}

      {fill.isError || enrich.isError ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {fill.isError
            ? fill.error instanceof Error
              ? fill.error.message
              : "AI fill failed."
            : enrich.error instanceof Error
              ? enrich.error.message
              : "AI enrich failed."}
        </p>
      ) : null}

      {suggestionsQuery.isPending ? (
        <p className="mt-3 text-sm text-slate-500">Loading suggestions…</p>
      ) : suggestions.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No AI suggestions yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              className="border-b border-slate-100 pb-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{suggestion.field}</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[suggestion.status]}`}
                >
                  {suggestion.status}
                </span>
              </div>
              <p className="mt-1 text-slate-700">{suggestion.suggestedValue}</p>
              {suggestion.currentValue !== null ? (
                <p className="mt-1 text-xs text-slate-500">
                  Current: {suggestion.currentValue}
                </p>
              ) : null}
              {suggestion.status === "PENDING" ? (
                <span className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      accept.mutate({ id: ticketId, suggestionId: suggestion.id })
                    }
                    disabled={accept.isPending || reject.isPending}
                    className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      reject.mutate({ id: ticketId, suggestionId: suggestion.id })
                    }
                    disabled={accept.isPending || reject.isPending}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
