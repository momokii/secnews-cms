import { useState } from "react";
import { Pagination } from "../../components/Pagination";
import { formatTimestamp } from "../../lib/datetime";
import { useTicketActivity } from "../../lib/useTickets";

interface ActivityTimelineProps {
  ticketId: string;
}

const ACTIVITY_PAGE_SIZES = [5, 10, 20] as const;
const DEFAULT_PAGE_SIZE = 5;

/** Immutable ticket activity timeline, newest first, with server pagination
 * (default 5 per page; 5/10/20 selectable via the shared Pagination footer). */
export function ActivityTimeline({ ticketId }: ActivityTimelineProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const activityQuery = useTicketActivity(ticketId, page, pageSize);
  const entries = activityQuery.data?.items ?? [];
  const total = activityQuery.data?.total ?? 0;

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
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        disabled={activityQuery.isPlaceholderData}
        itemLabel="entries"
        options={ACTIVITY_PAGE_SIZES}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </section>
  );
}
