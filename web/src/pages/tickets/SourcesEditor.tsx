import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  useAddTicketSource,
  useDeleteTicketSource,
  useUpdateTicketSource,
} from "../../lib/useTickets";
import type { TicketSource } from "../../lib/ticketsApi";
import { SourceModal, type SourceFormValues } from "./SourceModal";

const SOURCES_TOOLTIP =
  "Working materials — links, docs, or references the analyst used; add what you learned from each source in Notes";
const NOTES_PREVIEW_LIMIT = 120;

interface SourcesEditorProps {
  ticketId: string;
  sources: TicketSource[];
}

type ModalState = { mode: "add" } | { mode: "edit"; source: TicketSource } | null;

/** Research-notebook view of a ticket's working sources: each row is a card
 * with an optional title label, optional URL link, and expandable analyst
 * notes. Add/Edit share one modal; delete asks for confirmation. */
export function SourcesEditor({ ticketId, sources }: SourcesEditorProps) {
  const [modal, setModal] = useState<ModalState>(null);
  const [pendingDelete, setPendingDelete] = useState<TicketSource | null>(null);
  const addSource = useAddTicketSource();
  const updateSource = useUpdateTicketSource();
  const deleteSource = useDeleteTicketSource();

  const editing = modal?.mode === "edit" ? modal.source : null;

  const save = (values: SourceFormValues): void => {
    if (modal === null) return;
    if (modal.mode === "add") {
      addSource.mutate(
        { id: ticketId, body: values },
        { onSuccess: () => setModal(null) },
      );
      return;
    }
    // PATCH semantics: only the fields the user actually changed.
    const initial = sourceFormValues(modal.source);
    const next = {
      title: values.title ?? "",
      url: values.url ?? "",
      notes: values.notes ?? "",
    };
    const patch: { title?: string | null; url?: string | null; notes?: string | null } = {};
    if (next.title !== initial.title) patch.title = next.title === "" ? null : next.title;
    if (next.url !== initial.url) patch.url = next.url === "" ? null : next.url;
    if (next.notes !== initial.notes) patch.notes = next.notes === "" ? null : next.notes;
    if (Object.keys(patch).length === 0) {
      setModal(null);
      return;
    }
    updateSource.mutate(
      { id: ticketId, sourceId: modal.source.id, patch },
      { onSuccess: () => setModal(null) },
    );
  };

  const modalError =
    modal?.mode === "add"
      ? addSource.error
      : modal?.mode === "edit"
        ? updateSource.error
        : null;
  const modalBusy = addSource.isPending || updateSource.isPending;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-slate-900">Sources</h2>
          <button
            type="button"
            aria-label="About sources"
            title={SOURCES_TOOLTIP}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: "add" })}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500"
        >
          Add source
        </button>
      </div>

      {sources.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No sources yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-3"
            >
              <SourceRowContent source={source} />
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  aria-label="Edit source"
                  onClick={() => setModal({ mode: "edit", source })}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label="Delete source"
                  onClick={() => setPendingDelete(source)}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <SourceModal
        open={modal !== null}
        mode={modal?.mode ?? "add"}
        initial={editing !== null ? sourceFormValues(editing) : null}
        busy={modalBusy}
        error={modalError instanceof Error ? modalError.message : null}
        onClose={() => setModal(null)}
        onSave={save}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete !== null) {
            deleteSource.mutate({ id: ticketId, sourceId: pendingDelete.id });
          }
          setPendingDelete(null);
        }}
        title="Delete source"
        message="Remove this source from the ticket? Its notes are deleted with it."
        confirmLabel="Delete"
        busy={deleteSource.isPending}
      />
    </section>
  );
}

/** Card body: title label (or url, or an untitled fallback), optional link,
 * and the notes preview with expand/collapse. */
function SourceRowContent({ source }: { source: TicketSource }) {
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

function sourceFormValues(source: TicketSource): { title: string; url: string; notes: string } {
  return {
    title: source.title ?? "",
    url: source.url ?? "",
    notes: source.notes ?? source.note ?? "",
  };
}
