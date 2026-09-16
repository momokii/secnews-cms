import { useMemo, useState } from "react";
import { EMAIL_PLACEHOLDER_LEGEND, renderEmailPreview } from "../lib/emailPreview";
import { getUser } from "../lib/tokenStore";
import { useEmailTemplate, useSaveEmailTemplate } from "../lib/useEmailTemplate";

/** Email template studio (contract #57/#58): ADMIN-editable subject + HTML
 * body with placeholder legend and a sandboxed live preview fed by a fixed
 * sample ticket. Mirrors the bulletin template page's draft/save pattern. */
export function EmailTemplatePage() {
  const templateQuery = useEmailTemplate();
  const saveTemplate = useSaveEmailTemplate();
  const isAdmin = getUser()?.role === "ADMIN";

  // null drafts = no local edit; save drops them so the editors fall back to
  // the refetched server value.
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null);
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);

  const serverSubject = templateQuery.data?.subject ?? "";
  const serverBody = templateQuery.data?.htmlBody ?? "";
  const subjectValue = subjectDraft ?? serverSubject;
  const bodyValue = bodyDraft ?? serverBody;
  const previewDoc = useMemo(() => renderEmailPreview(bodyValue), [bodyValue]);

  const save = (): void => {
    saveTemplate.mutate(
      { subject: subjectValue, htmlBody: bodyValue },
      {
        onSuccess: () => {
          setSubjectDraft(null);
          setBodyDraft(null);
        },
      },
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Email template</h1>

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
          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="email-subject">
            Subject
          </label>
          <input
            id="email-subject"
            aria-label="Subject"
            type="text"
            value={subjectValue}
            onChange={(event) => setSubjectDraft(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
          />

          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="email-body">
            HTML body
          </label>
          <textarea
            id="email-body"
            aria-label="HTML body"
            value={bodyValue}
            onChange={(event) => setBodyDraft(event.target.value)}
            rows={12}
            className="mt-1 w-full rounded-md border border-slate-200 p-3 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
          />

          <div aria-label="Placeholder legend" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {EMAIL_PLACEHOLDER_LEGEND.map((placeholder) => (
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
              onClick={save}
              disabled={saveTemplate.isPending}
              className="mt-3 rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Save template
            </button>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              Only ADMIN can edit the org-wide email template.
            </p>
          )}
        </>
      )}

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h2 className="text-sm font-semibold text-slate-900">Preview (sample ticket data)</h2>
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={previewDoc}
          className="mt-2 h-96 w-full rounded-md border border-slate-200 bg-white"
        />
      </div>
    </section>
  );
}
