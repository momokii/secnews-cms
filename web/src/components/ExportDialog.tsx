import { useState } from "react";
import { createExport, type ExportFormat, type ExportType } from "../lib/exportsApi";
import { Modal } from "./Modal";

export interface ExportDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly type: ExportType;
}

const FORMATS: readonly ExportFormat[] = ["CSV", "JSON", "XLSX"] as const;

export function ExportDialog({ open, onClose, type }: ExportDialogProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState<ExportFormat>("CSV");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = type === "feed" ? "Export feed" : "Export ticket";

  const handleClose = (): void => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createExport({
        type,
        format,
        from: from === "" ? undefined : from,
        to: to === "" ? undefined : to,
      });
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">From</span>
            <input
              aria-label="From date"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              disabled={busy}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">To</span>
            <input
              aria-label="To date"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              disabled={busy}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none disabled:opacity-50"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">Leave dates empty to export all time.</p>

        <fieldset className="space-y-2" disabled={busy}>
          <legend className="text-xs font-medium text-slate-600">Format</legend>
          <div className="flex flex-wrap gap-4">
            {FORMATS.map((value) => (
              <label
                key={value}
                className="flex items-center gap-1.5 text-sm text-slate-700"
              >
                <input
                  type="radio"
                  name="export-format"
                  value={value}
                  checked={format === value}
                  onChange={() => setFormat(value)}
                  className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span>{value}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error !== null ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
