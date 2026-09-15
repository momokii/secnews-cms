import { useState } from "react";
import { formatTimestamp } from "../lib/datetime";
import { getUser } from "../lib/tokenStore";
import type { PromptEntry, PromptKind } from "../lib/promptsApi";
import { usePrompts, useSavePrompt } from "../lib/usePrompts";
import { PromptHistory } from "./PromptHistory";

/** Mirrors PROMPT_PLACEHOLDERS in src/modules/ai/prompt-template.ts — the
 * variables the renderer actually binds. Unknown placeholders are left
 * literal by the backend renderer. */
const PROMPT_PLACEHOLDERS = [
  {
    token: "{{ticketContext}}",
    gloss:
      "Ticket header block: title, summary, findingType, tlp, iocs (type:value, comma-joined), sources — lines appear only when non-empty",
  },
  {
    token: "{{missingFields}}",
    gloss:
      "Comma-joined final fields with no current value (the strict fill scope: overview, description, cveIds, affectedVersions, mitigation)",
  },
  {
    token: "{{currentFields}}",
    gloss: "One line per suggestible final field: \"<field>: <current value or <empty>>\"",
  },
] as const;

const CARD_TITLES: Readonly<Record<PromptKind, string>> = {
  FILL: "Fill",
  ENRICH: "Enrich",
};

/** Analyst-facing guidance per template: when it runs, what it may use, what
 * it guarantees, and how its output lands in the ticket. */
const CARD_GUIDANCE: Readonly<Record<PromptKind, readonly string[]>> = {
  FILL: [
    "Runs from the Fill button on a ticket: it drafts the report body from the ticket's working materials.",
    "It never invents ticket facts — it organizes only what the ticket already contains.",
  ],
  ENRICH: [
    "Runs from the Enrich button on a ticket: it drafts the overview, description, recommendations, references and CVE context from the ticket's working materials.",
    "It never invents findings — every suggestion traces back to the ticket's own sources.",
    "PENDING suggestions auto-merge on accept, so every addition needs Accept, Edit, or Reject before it reaches the final fields.",
  ],
};

interface PromptCardProps {
  kind: PromptKind;
  content: string;
  updatedAt: string;
  isAdmin: boolean;
}

/** One editor card with its own draft + mutation so a save (or its error)
 * stays scoped to the card — mirrors the BulletinPage editor pattern. */
function PromptCard({ kind, content, updatedAt, isAdmin }: PromptCardProps) {
  const savePrompt = useSavePrompt();
  // null draft = no local edit; save drops the draft so the editor falls back
  // to the refetched server value.
  const [draft, setDraft] = useState<string | null>(null);
  const editorValue = draft ?? content;
  const label = `${CARD_TITLES[kind]} prompt`;
  return (
    <div className="mt-6 border-t border-slate-200 pt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          {CARD_TITLES[kind]} prompt
        </h2>
        <span className="text-xs text-slate-500">
          Updated {formatTimestamp(updatedAt)}
        </span>
      </div>

      <ul className="mt-2 space-y-1 text-xs text-slate-500">
        {CARD_GUIDANCE[kind].map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <textarea
        aria-label={label}
        value={editorValue}
        onChange={(event) => setDraft(event.target.value)}
        rows={10}
        className="mt-2 w-full rounded-md border border-slate-200 p-3 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
      />

      {savePrompt.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {savePrompt.error instanceof Error
            ? savePrompt.error.message
            : "Failed to save the prompt."}
        </p>
      ) : null}

      {isAdmin ? (
        <button
          type="button"
          onClick={() =>
            savePrompt.mutate(
              { kind, content: editorValue },
              { onSuccess: () => setDraft(null) },
            )
          }
          disabled={editorValue === "" || savePrompt.isPending}
          className="mt-3 rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Save {label}
        </button>
      ) : null}

      <PromptHistory
        kind={kind}
        title={CARD_TITLES[kind]}
        isAdmin={isAdmin}
        onRestored={() => setDraft(null)}
      />
    </div>
  );
}

export function PromptsPage() {
  const promptsQuery = usePrompts();
  const isAdmin = getUser()?.role === "ADMIN";

  const byKind = new Map<PromptKind, PromptEntry>();
  for (const entry of promptsQuery.data ?? []) {
    byKind.set(entry.kind, entry);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Prompt templates</h1>
      <p className="mt-1 text-sm text-slate-500">
        System prompts sent to the AI provider for fill and enrich suggestions.
      </p>

      {promptsQuery.isPending ? (
        <p className="mt-4 text-sm text-slate-500">Loading prompts…</p>
      ) : promptsQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {promptsQuery.error instanceof Error
            ? promptsQuery.error.message
            : "Failed to load the prompts."}
        </p>
      ) : (
        <>
          <PromptCard
            kind="FILL"
            content={byKind.get("FILL")?.content ?? ""}
            updatedAt={byKind.get("FILL")?.updatedAt ?? ""}
            isAdmin={isAdmin}
          />
          <PromptCard
            kind="ENRICH"
            content={byKind.get("ENRICH")?.content ?? ""}
            updatedAt={byKind.get("ENRICH")?.updatedAt ?? ""}
            isAdmin={isAdmin}
          />

          {isAdmin ? null : (
            <p className="mt-3 text-xs text-slate-500">
              Only ADMIN can edit the org-wide prompts.
            </p>
          )}

          <div className="mt-6 border-t border-slate-200 pt-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Placeholder legend
            </h2>
            <div aria-label="Placeholder legend" className="mt-2">
              <ul className="space-y-1 text-xs text-slate-500">
                {PROMPT_PLACEHOLDERS.map((placeholder) => (
                  <li key={placeholder.token}>
                    <code className="text-slate-700">{placeholder.token}</code>
                    {" — "}
                    {placeholder.gloss}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                Placeholders are replaced per ticket at render time. Unknown
                placeholders stay literal in the sent prompt.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
