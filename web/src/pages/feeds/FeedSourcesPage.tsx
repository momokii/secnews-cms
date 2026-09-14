import { useState } from "react";
import type { FeedSource } from "../../lib/feedsApi";
import { useDeleteFeed, useFeedSources, useUpdateFeed } from "../../lib/useFeeds";
import { FeedDeleteDialog } from "./FeedDeleteDialog";
import { FeedFormDialog } from "./FeedFormDialog";

interface FormDialogState {
  open: boolean;
  source: FeedSource | null;
}

export function FeedSourcesPage() {
  const [page, setPage] = useState(1);
  const [formDialog, setFormDialog] = useState<FormDialogState>({
    open: false,
    source: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<FeedSource | null>(null);

  const sourcesQuery = useFeedSources(page);
  const updateFeed = useUpdateFeed();
  const deleteFeed = useDeleteFeed();

  const sources = sourcesQuery.data?.items ?? [];
  const total = sourcesQuery.data?.total ?? 0;
  const pageSize = sourcesQuery.data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const closeFormDialog = (): void =>
    setFormDialog({ open: false, source: null });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Feeds</h1>
        <button
          type="button"
          onClick={() => setFormDialog({ open: true, source: null })}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500"
        >
          Add feed
        </button>
      </div>

      {sourcesQuery.isPending ? (
        <p className="mt-4 text-sm text-slate-500">Loading feed sources…</p>
      ) : sourcesQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {sourcesQuery.error instanceof Error
            ? sourcesQuery.error.message
            : "Failed to load feed sources."}
        </p>
      ) : sources.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No feed sources yet. Add one to start polling.
        </p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th scope="col" className="py-2 pr-4 font-medium">Name</th>
              <th scope="col" className="py-2 pr-4 font-medium">URL</th>
              <th scope="col" className="py-2 pr-4 font-medium">Active</th>
              <th scope="col" className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-900">{source.name}</td>
                <td className="py-2 pr-4 text-slate-500">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:text-indigo-500"
                  >
                    {source.url}
                  </a>
                </td>
                <td className="py-2 pr-4">
                  <label className="flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={source.active}
                      onChange={(event) =>
                        updateFeed.mutate({
                          id: source.id,
                          patch: { active: event.target.checked },
                        })
                      }
                    />
                    {source.active ? "Active" : "Paused"}
                  </label>
                </td>
                <td className="py-2">
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormDialog({ open: true, source })}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteFeed.reset();
                        setDeleteTarget(source);
                      }}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {page} of {totalPages} — {total} sources
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </span>
      </div>

      {formDialog.open ? (
        <FeedFormDialog
          key={formDialog.source === null ? "create" : formDialog.source.id}
          source={formDialog.source}
          onClose={closeFormDialog}
        />
      ) : null}
      <FeedDeleteDialog
        source={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  );
}
