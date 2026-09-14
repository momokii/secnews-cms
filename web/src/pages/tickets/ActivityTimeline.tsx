import { useState } from "react";
import { formatTimestamp } from "../../lib/datetime";
import { useTicketActivity } from "../../lib/useTickets";

interface ActivityTimelineProps {
  ticketId: string;
}

/** Immutable ticket activity timeline, newest first, with server pagination. */
export function ActivityTimeline({ ticketId }: ActivityTimelineProps) {
  const [page, setPage] = useState(1);
  const activityQuery = useTicketActivity(ticketId, page);
  const entries = activityQuery.data?.items ?? [];
  const total = activityQuery.data?.total ?? 0;
  const pageSize = activityQuery.data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Activity</h2>
      {activityQuery.isPending ? (
        <p className="mt-2 text-sm text-slate-500">Loading activity…</p>
      ) : activityQuery.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {activityQuery.error instanceof Error
            ? activityQuery.error.message
            : "Failed to load activity."}
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No activity yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="border-b border-slate-100 pb-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{entry.action}</span>
                <span className="text-slate-500">by {entry.actorName ?? "System"}</span>
                <time className="text-xs text-slate-500" dateTime={entry.createdAt}>
                  {formatTimestamp(entry.createdAt)} WIB
                </time>
              </div>
              {entry.detail !== null ? (
                <p className="mt-1 text-xs text-slate-600">{entry.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>Page {page} of {totalPages} — {total} entries</span>
        <span className="flex gap-2">
          <button
            type="button"
            aria-label="Previous activity page"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || activityQuery.isPlaceholderData}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            aria-label="Next activity page"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= totalPages || activityQuery.isPlaceholderData}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </span>
      </div>
    </section>
  );
}
