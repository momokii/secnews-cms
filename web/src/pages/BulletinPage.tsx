import { useState } from "react";
import { CopyButton } from "../components/CopyButton";
import { getUser } from "../lib/tokenStore";
import { useBulletinPreview, useBulletinTemplate, useSaveBulletinTemplate } from "../lib/useBulletin";

const PLACEHOLDERS = [
  { token: "{{title}}", gloss: "Ticket title" },
  { token: "{{overview}}", gloss: "Executive overview" },
  { token: "{{description}}", gloss: "Detailed description" },
  { token: "{{ioc_block}}", gloss: "Defanged IOC list" },
  { token: "{{recommendations}}", gloss: "Recommended actions" },
  { token: "{{references}}", gloss: "Source references" },
] as const;

export function BulletinPage() {
  const templateQuery = useBulletinTemplate();
  const saveTemplate = useSaveBulletinTemplate();
  const preview = useBulletinPreview();
  const isAdmin = getUser()?.role === "ADMIN";

  // null draft = no local edit; save drops the draft so the editor falls back
  // to the refetched server value.
  const [draft, setDraft] = useState<string | null>(null);
  const [ticketIdInput, setTicketIdInput] = useState("");

  const serverTemplate = templateQuery.data?.template ?? "";
  const editorValue = draft ?? serverTemplate;

  const ticketId = ticketIdInput.trim();
  const ticketIdIsValid = ticketId !== "";

  const rendered = preview.data?.rendered ?? "";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Bulletin template</h1>

      {templateQuery.isPending ? (
        <p className="mt-4 text-sm text-slate-500">Loading template…</p>
      ) : templateQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {templateQuery.error instanceof Error
            ? templateQuery.error.message
            : "Failed to load the template."}
        </p>
      ) : (
        <>
          <textarea
            aria-label="Template"
            value={editorValue}
            onChange={(event) => setDraft(event.target.value)}
            rows={12}
            className="mt-4 w-full rounded-md border border-slate-200 p-3 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
          />

          <div aria-label="Placeholder legend" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {PLACEHOLDERS.map((placeholder) => (
              <span key={placeholder.token}>
                <code className="text-slate-700">{placeholder.token}</code>
                {" — "}
                {placeholder.gloss}
              </span>
            ))}
          </div>

          {saveTemplate.isError ? (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {saveTemplate.error instanceof Error
                ? saveTemplate.error.message
                : "Failed to save the template."}
            </p>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              onClick={() =>
                saveTemplate.mutate(editorValue, {
                  onSuccess: () => setDraft(null),
                })
              }
              disabled={editorValue === "" || saveTemplate.isPending}
              className="mt-3 rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Save template
            </button>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              Only ADMIN can edit the org-wide template.
            </p>
          )}
        </>
      )}

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h2 className="text-sm font-semibold text-slate-900">Preview</h2>
        <div className="mt-2 flex items-start gap-2">
          <input
            aria-label="Ticket ID"
            type="text"
            value={ticketIdInput}
            onChange={(event) => setTicketIdInput(event.target.value)}
            placeholder="Ticket ID (uuid)"
            className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => preview.mutate(ticketId)}
            disabled={!ticketIdIsValid || preview.isPending}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Preview
          </button>
          <CopyButton
            text={rendered}
            label="Copy bulletin"
            feedbackClassName="text-xs text-emerald-700"
          />
        </div>

        {preview.isError ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {preview.error instanceof Error
              ? preview.error.message
              : "Failed to render the preview."}
          </p>
        ) : null}

        <pre
          aria-label="Bulletin preview"
          className="mt-3 min-h-24 whitespace-pre-wrap rounded-md bg-slate-900 p-4 font-mono text-sm text-slate-100"
        >
          {rendered === "" ? "Preview renders the exact defanged body for a READY ticket." : rendered}
        </pre>
      </div>
    </section>
  );
}
