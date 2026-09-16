import { useState } from "react";
import type { SourceDraftBody, TicketSource } from "../../lib/ticketsApi";
import { useSourceDraft } from "../../lib/useTickets";
import { SuggestionList } from "./SuggestionList";

const SOURCE_DRAFT_TOOLTIP =
  "Drafts the target fields ONLY from the sources you pick (never invents facts); every draft lands as a reviewable suggestion below — Accept/Edit/Reject.";
const SOURCE_DRAFT_FIELDS = [
  { value: "overview", label: "Overview" },
  { value: "description", label: "Description" },
  { value: "recommendations", label: "Recommendations" },
  { value: "references", label: "References" },
] as const;

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

function sourceName(source: TicketSource): string {
  return source.title ?? source.url ?? source.id;
}

function sourcePreview(source: TicketSource): string {
  return source.notes ?? source.note ?? "";
}

interface SourceDraftPanelProps {
  ticketId: string;
  sources: TicketSource[];
}

/** Source Draft: pick sources, pick target fields, run — the drafts land in
 * the same server-paginated suggestion review list as AI assist. */
export function SourceDraftPanel({ ticketId, sources }: SourceDraftPanelProps) {
  const run = useSourceDraft();
  const [selectedSourceIds, setSelectedSourceIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [targetFields, setTargetFields] = useState<ReadonlySet<string>>(() =>
    new Set(SOURCE_DRAFT_FIELDS.map((field) => field.value)),
  );
  const [allowWebSearch, setAllowWebSearch] = useState(false);

  const canRun = selectedSourceIds.size > 0 && targetFields.size > 0;

  const toggleSource = (id: string, checked: boolean): void => {
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleField = (field: string, checked: boolean): void => {
    setTargetFields((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(field);
      } else {
        next.delete(field);
      }
      return next;
    });
  };

  const onRun = (): void => {
    const body: SourceDraftBody = {
      sourceIds: [...selectedSourceIds],
      targetFields: [...targetFields],
      allowWebSearch,
    };
    run.mutate({ id: ticketId, body });
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Source draft</h2>
        <span title={SOURCE_DRAFT_TOOLTIP} className="flex items-center text-slate-400">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-4 w-4"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Drafts target fields only from the sources you pick — never invents
        facts. Toggle web search to let References also use online reference
        search. Results land below as reviewable suggestions.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <fieldset className="min-w-0">
          <legend className="flex items-center gap-2 text-xs text-slate-500">
            Sources
            <span className="flex gap-1">
              <button
                type="button"
                onClick={() =>
                  setSelectedSourceIds(new Set(sources.map((source) => source.id)))
                }
                className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedSourceIds(new Set())}
                className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                Select none
              </button>
            </span>
          </legend>
          <ul className="mt-2 flex flex-col gap-1">
            {sources.map((source) => (
              <li key={source.id} className="flex gap-2 rounded-md p-1 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  aria-label={`Select source: ${sourceName(source)}`}
                  checked={selectedSourceIds.has(source.id)}
                  onChange={(event) => toggleSource(source.id, event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block break-words font-medium text-slate-900">
                    {sourceName(source)}
                  </span>
                  {source.url !== null ? (
                    <span className="block break-all text-xs text-slate-500">
                      {source.url}
                    </span>
                  ) : null}
                  {sourcePreview(source) !== "" ? (
                    <span className="block break-words text-xs text-slate-500">
                      {sourcePreview(source)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="text-xs text-slate-500">Target fields</legend>
          <div className="mt-2 flex flex-col gap-1">
            {SOURCE_DRAFT_FIELDS.map((field) => (
              <label
                key={field.value}
                className="flex items-center gap-2 rounded-md p-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={targetFields.has(field.value)}
                  onChange={(event) => toggleField(field.value, event.target.checked)}
                  className="h-4 w-4"
                />
                {field.label}
              </label>
            ))}
            <label className="mt-2 flex items-center gap-2 rounded-md p-1 text-sm text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={allowWebSearch}
                onChange={(event) => setAllowWebSearch(event.target.checked)}
                className="h-4 w-4"
              />
              Allow web search for References
            </label>
          </div>
        </fieldset>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun || run.isPending}
          className="flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {run.isPending ? <Spinner /> : null}
          {run.isPending ? "Drafting…" : "Run"}
        </button>
      </div>

      {run.isError ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {run.error instanceof Error ? run.error.message : "Source draft failed."}
        </p>
      ) : null}

      <SuggestionList ticketId={ticketId} origin={["SOURCE_DRAFT"]} />
    </section>
  );
}
