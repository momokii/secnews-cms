import { useState } from "react";
import { formatTimestamp } from "../../lib/datetime";
import type { AvailableIntegration } from "../../lib/integrationsApi";
import {
  AI_PROVIDERS,
  type AiProviderKind,
  type AiRunBody,
  type AiSuggestion,
} from "../../lib/ticketsApi";
import { useAvailableIntegrations } from "../../lib/useIntegrations";
import {
  useAcceptSuggestion,
  useAiEnrich,
  useAiFill,
  useDeleteSuggestion,
  useRejectSuggestion,
  useSuggestions,
} from "../../lib/useTickets";
import { AiHelpModal } from "./AiHelpModal";

interface AiPanelProps {
  ticketId: string;
  /** From TicketDetail.pendingSuggestions — the S2 hard-block FE signal. */
  pendingSuggestions: number;
  /** Set when a delivery mutation came back 409 PENDING_SUGGESTIONS. */
  blocked: boolean;
}

const AUTO_PROVIDER = "AUTO";
const DEFAULT_MODEL_PLACEHOLDER = "default";

const BADGE_CLASSES: Readonly<Record<AiSuggestion["status"], string>> = {
  PENDING: "bg-amber-100 text-amber-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-slate-100 text-slate-700",
};

function isAiProvider(kind: string): kind is AiProviderKind {
  return AI_PROVIDERS.some((provider) => provider === kind);
}

type PickerValue = AiProviderKind | typeof AUTO_PROVIDER;

/** The select only ever offers AUTO + keyed AI providers; anything else falls
 * back to AUTO (boundary parse for the DOM string). */
function parsePickerValue(value: string): PickerValue {
  if (value === AUTO_PROVIDER) return AUTO_PROVIDER;
  return isAiProvider(value) ? value : AUTO_PROVIDER;
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4 animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-25"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

/** AI assist: strict fill / full enrich with provider/model overrides,
 * suggestion review with PENDING badges + accept/reject, and the S2
 * hard-block banner. */
export function AiPanel({ ticketId, pendingSuggestions, blocked }: AiPanelProps) {
  const fill = useAiFill();
  const enrich = useAiEnrich();
  const suggestionsQuery = useSuggestions(ticketId);
  const accept = useAcceptSuggestion();
  const reject = useRejectSuggestion();
  const remove = useDeleteSuggestion();
  const availableQuery = useAvailableIntegrations();
  const [provider, setProvider] = useState<PickerValue>(AUTO_PROVIDER);
  const [model, setModel] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  const aiBusy = fill.isPending || enrich.isPending;
  const keyedProviders = (availableQuery.data ?? []).filter(
    (item): item is AvailableIntegration & { kind: AiProviderKind } =>
      item.hasKey && isAiProvider(item.kind),
  );
  const modelPlaceholder =
    keyedProviders.find((item) => item.kind === provider)?.model ??
    DEFAULT_MODEL_PLACEHOLDER;

  const aiBody = (): AiRunBody => {
    if (provider === AUTO_PROVIDER) return {};
    const trimmed = model.trim();
    return trimmed === "" ? { provider } : { provider, model: trimmed };
  };

  const deliveryBlocked = blocked || pendingSuggestions > 0;
  const suggestions = suggestionsQuery.data?.items ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">AI assist</h2>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="rounded-md px-2 py-1 text-sm text-indigo-600 hover:bg-indigo-50 hover:text-indigo-500"
        >
          How Fill &amp; Enrich work
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Fill: drafts Overview/Description/etc. ONLY from this ticket's materials
        (never invents facts). Enrich: researches extra context first; every
        addition lands as a reviewable suggestion you must Accept/Edit/Reject —
        sending is blocked while any is pending.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Provider
          <select
            aria-label="AI provider"
            value={provider}
            onChange={(event) => setProvider(parsePickerValue(event.target.value))}
            className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700"
          >
            <option value={AUTO_PROVIDER}>Auto (first configured)</option>
            {keyedProviders.map((item) => (
              <option key={item.kind} value={item.kind}>
                {item.kind}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Model
          <input
            aria-label="AI model (optional)"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={modelPlaceholder}
            className="w-48 rounded-md border border-slate-200 px-2 py-2 text-sm text-slate-700 placeholder:text-slate-400"
          />
        </label>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => fill.mutate({ id: ticketId, body: aiBody() })}
            disabled={aiBusy}
            className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {fill.isPending ? <Spinner /> : null}
            {fill.isPending ? "Filling…" : "AI fill (strict)"}
          </button>
          <button
            type="button"
            onClick={() => enrich.mutate({ id: ticketId, body: aiBody() })}
            disabled={aiBusy}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {enrich.isPending ? <Spinner /> : null}
            {enrich.isPending ? "Enriching…" : "AI enrich"}
          </button>
        </span>
      </div>

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
              {suggestion.status !== "ACCEPTED" ? (
                <span className="mt-2 flex gap-2">
                  {suggestion.status === "PENDING" ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          accept.mutate({ id: ticketId, suggestionId: suggestion.id })
                        }
                        disabled={accept.isPending || reject.isPending || remove.isPending}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          reject.mutate({ id: ticketId, suggestionId: suggestion.id })
                        }
                        disabled={accept.isPending || reject.isPending || remove.isPending}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete this ${suggestion.status.toLowerCase()} ${suggestion.field} suggestion? This cannot be undone.`,
                        )
                      ) {
                        remove.mutate({ id: ticketId, suggestionId: suggestion.id });
                      }
                    }}
                    disabled={accept.isPending || reject.isPending || remove.isPending}
                    className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete {suggestion.field} suggestion
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <AiHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}
