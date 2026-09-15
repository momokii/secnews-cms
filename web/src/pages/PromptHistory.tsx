import { useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { formatTimestamp } from "../lib/datetime";
import type { PromptKind, PromptRevision } from "../lib/promptsApi";
import { usePromptHistory, useSavePrompt } from "../lib/usePrompts";

const HISTORY_PAGE_SIZE = 2;

interface PromptHistoryProps {
  kind: PromptKind;
  title: string;
  isAdmin: boolean;
  onRestored: () => void;
}

/** Inline revision history for one prompt card: newest-first paginated list
 * (GET /prompts/:kind/history) with an ADMIN-only restore that reuses the
 * save endpoint (PUT /prompts/:kind) behind a confirm dialog. */
export function PromptHistory({ kind, title, isAdmin, onRestored }: PromptHistoryProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [restoreTarget, setRestoreTarget] = useState<PromptRevision | null>(null);
  const historyQuery = usePromptHistory({
    kind,
    page,
    pageSize: HISTORY_PAGE_SIZE,
    enabled: open,
  });
  const savePrompt = useSavePrompt();

  const totalPages =
    historyQuery.data === undefined
      ? 0
      : Math.max(1, Math.ceil(historyQuery.data.total / historyQuery.data.pageSize));

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            setPage(1);
            setOpen(true);
          }
        }}
        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
      >
        View {title} history
      </button>

      {open ? (
        <div className="mt-3 rounded-md border border-slate-200 p-3">
          {historyQuery.isPending ? (
            <p className="text-xs text-slate-500">Loading history…</p>
          ) : historyQuery.isError ? (
            <p role="alert" className="text-xs text-red-600">
              {historyQuery.error instanceof Error
                ? historyQuery.error.message
                : "Failed to load the prompt history."}
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {historyQuery.data.items.map((revision) => (
                  <li key={revision.id} className="rounded-md bg-slate-50 p-2">
                    <p className="font-mono text-xs break-all text-slate-900">
                      {revision.content}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {revision.actorName ?? "Unknown"} · {formatTimestamp(revision.createdAt)}
                    </p>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => setRestoreTarget(revision)}
                        className="mt-2 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        Restore {revision.content}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Previous history page for {title}
                </button>
                <span className="text-xs text-slate-500">
                  Page {historyQuery.data.page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Next history page for {title}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        onConfirm={() => {
          if (restoreTarget === null) return;
          savePrompt.mutate(
            { kind, content: restoreTarget.content },
            {
              onSuccess: () => {
                setRestoreTarget(null);
                onRestored();
              },
            },
          );
        }}
        title="Restore prompt"
        confirmLabel="Restore prompt"
        busy={savePrompt.isPending}
        message={`Restore this revision as the current ${title} prompt? The editor above reloads with its content.`}
      />
    </div>
  );
}
