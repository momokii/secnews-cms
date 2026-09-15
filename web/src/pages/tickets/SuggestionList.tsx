import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { formatTimestamp } from "../../lib/datetime";
import type { AiSuggestion } from "../../lib/ticketsApi";
import {
  useAcceptSuggestion,
  useDeleteSuggestion,
  useRejectSuggestion,
  useSuggestions,
} from "../../lib/useTickets";

const DELETE_TOOLTIP =
  "The merged field values remain on the ticket; only the suggestion record is removed.";

const BADGE_CLASSES: Readonly<Record<AiSuggestion["status"], string>> = {
  PENDING: "bg-amber-100 text-amber-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-slate-100 text-slate-700",
};

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3 shrink-0"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

/** Provenance line: "<WIB time> · <provider|Auto> · <model>" (model omitted
 * when the suggestion carries none). */
function suggestionMetaLine(suggestion: AiSuggestion): string {
  const provider = suggestion.provider ?? "Auto";
  const model =
    suggestion.model === null ? "" : ` · ${suggestion.model}`;
  return `${formatTimestamp(suggestion.createdAt)} WIB · ${provider}${model}`;
}

/** Accepted rows keep their merged ticket values on delete; the rest are lost. */
function deleteMessage(suggestion: AiSuggestion): string {
  const note =
    suggestion.status === "ACCEPTED"
      ? "The merged field values remain on the ticket."
      : "This cannot be undone.";
  return `Delete this ${suggestion.status.toLowerCase()} ${suggestion.field} suggestion? ${note}`;
}

/** Suggestion review list: PENDING badges, accept/reject, and delete on any
 * status via the shared ConfirmDialog. Owns its suggestions query. */
export function SuggestionList({ ticketId }: { ticketId: string }) {
  const suggestionsQuery = useSuggestions(ticketId);
  const accept = useAcceptSuggestion();
  const reject = useRejectSuggestion();
  const remove = useDeleteSuggestion();
  const [deleteTarget, setDeleteTarget] = useState<AiSuggestion | null>(null);

  const suggestions = suggestionsQuery.data?.items ?? [];
  const busy = accept.isPending || reject.isPending || remove.isPending;

  return (
    <>
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
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <ClockIcon />
                <span>{suggestionMetaLine(suggestion)}</span>
              </p>
              <p className="mt-1 text-slate-700">{suggestion.suggestedValue}</p>
              {suggestion.currentValue !== null ? (
                <p className="mt-1 text-xs text-slate-500">
                  Current: {suggestion.currentValue}
                </p>
              ) : null}
              <span className="mt-2 flex gap-2">
                {suggestion.status === "PENDING" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        accept.mutate({ id: ticketId, suggestionId: suggestion.id })
                      }
                      disabled={busy}
                      className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        reject.mutate({ id: ticketId, suggestionId: suggestion.id })
                      }
                      disabled={busy}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDeleteTarget(suggestion)}
                  disabled={busy}
                  title={DELETE_TOOLTIP}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete {suggestion.field} suggestion
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget !== null) {
            remove.mutate({ id: ticketId, suggestionId: deleteTarget.id });
          }
          setDeleteTarget(null);
        }}
        title="Delete suggestion"
        message={deleteTarget === null ? "" : deleteMessage(deleteTarget)}
      />
    </>
  );
}
