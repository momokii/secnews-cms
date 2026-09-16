import { useState } from "react";
import { Modal } from "../../components/Modal";

export interface SourceFormValues {
  title?: string;
  url?: string;
  notes?: string;
}

interface SourceModalProps {
  open: boolean;
  mode: "add" | "edit";
  initial: SourceFormValues | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (values: SourceFormValues) => void;
}

const inputClass =
  "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none";

/** Add/Edit dialog for a ticket source: optional title label, optional URL,
 * and a long-form notes textarea (the analyst's research notebook entry). */
export function SourceModal({ open, mode, initial, busy, error, onClose, onSave }: SourceModalProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // Reset the fields when the dialog (re)opens — the React-approved
  // "adjust state during render" pattern, no effect needed.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTitle(initial?.title ?? "");
      setUrl(initial?.url ?? "");
      setNotes(initial?.notes ?? "");
    }
  }

  const canSave = title.trim() !== "" || url.trim() !== "" || notes.trim() !== "";

  const save = (): void => {
    onSave({
      ...(title.trim() === "" ? {} : { title: title.trim() }),
      ...(url.trim() === "" ? {} : { url: url.trim() }),
      ...(notes.trim() === "" ? {} : { notes: notes.trim() }),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === "add" ? "Add source" : "Edit source"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) save();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Title</span>
          <input
            aria-label="Title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Vendor advisory, PDF name, Slack thread"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">URL</span>
          <input
            aria-label="URL"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://… (optional)"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Notes</span>
          <textarea
            aria-label="Notes"
            rows={8}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What did you learn from this source?"
            className={`${inputClass} resize-y min-h-44`}
          />
        </label>
        {error !== null ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave || busy}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
