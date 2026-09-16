import { useState } from "react";
import type { TicketSource } from "../../lib/ticketsApi";

const NOTES_PREVIEW_LIMIT = 120;

/** Card body of one source row: title label (or url, or an untitled
 * fallback), optional link, and the notes preview with expand/collapse. */
export function SourceRowContent({ source }: { source: TicketSource }) {
  const notes = source.notes ?? source.note;
  return (
    <span className="flex min-w-0 flex-col gap-1">
      {source.title !== null ? (
        <span className="text-sm font-medium text-slate-900">{source.title}</span>
      ) : source.url === null ? (
        <span className="text-sm italic text-slate-500">Untitled source</span>
      ) : null}
      {source.url !== null ? (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="break-all text-sm text-indigo-600 hover:text-indigo-500"
        >
          {source.url}
        </a>
      ) : null}
      {notes !== null && notes !== "" ? <NotesPreview text={notes} /> : null}
    </span>
  );
}

function NotesPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= NOTES_PREVIEW_LIMIT) {
    return <span className="whitespace-pre-wrap text-sm text-slate-700">{text}</span>;
  }
  if (expanded) {
    return (
      <>
        <span className="whitespace-pre-wrap text-sm text-slate-700">{text}</span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="self-start text-xs text-indigo-600 hover:text-indigo-500"
        >
          Show less
        </button>
      </>
    );
  }
  return (
    <>
      <span className="whitespace-pre-wrap text-sm text-slate-700">
        {text.slice(0, NOTES_PREVIEW_LIMIT)}
      </span>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="self-start text-xs text-indigo-600 hover:text-indigo-500"
      >
        Show more
      </button>
    </>
  );
}
