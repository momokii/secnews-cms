import { useState } from "react";
import type { AvailableIntegration } from "../../lib/integrationsApi";
import {
  AI_PROVIDERS,
  type AiProviderKind,
  type AiRunBody,
} from "../../lib/ticketsApi";
import { useAvailableIntegrations } from "../../lib/useIntegrations";
import { useAiEnrich, useAiFill } from "../../lib/useTickets";
import { AiHelpModal } from "./AiHelpModal";
import { SuggestionList } from "./SuggestionList";

interface AiPanelProps {
  ticketId: string;
  /** From TicketDetail.pendingSuggestions — the S2 hard-block FE signal. */
  pendingSuggestions: number;
  /** Set when a delivery mutation came back 409 PENDING_SUGGESTIONS. */
  blocked: boolean;
}

const AUTO_PROVIDER = "AUTO";
const DEFAULT_MODEL_PLACEHOLDER = "default";

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

/** AI assist: strict fill / full enrich with provider/model overrides,
 * suggestion review with PENDING badges + accept/reject, and the S2
 * hard-block banner. */
export function AiPanel({ ticketId, pendingSuggestions, blocked }: AiPanelProps) {
  const fill = useAiFill();
  const enrich = useAiEnrich();
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

  void blocked;
  void pendingSuggestions;

  return (
    <section
      id="ai-assist"
      className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
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

      <SuggestionList ticketId={ticketId} origin={["FILL", "ENRICH"]} />

      <AiHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}
