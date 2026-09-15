import { useState } from "react";
import { Pagination } from "../../components/Pagination";
import { formatTimestamp } from "../../lib/datetime";
import {
  TICKET_ACTIVITY_ACTIONS,
  type TicketActivityAction,
} from "../../lib/ticketsApi";
import { useTicketActivity } from "../../lib/useTickets";
import { ActivityDetail } from "./ActivityDetail";

interface ActivityTimelineProps {
  ticketId: string;
  /** Ticket-confirmed pulse — lets OTX_PUSHED entries link to their pulse. */
  pulseId?: string | null;
  pulseUrl?: string | null;
}

const ACTIVITY_PAGE_SIZES = [5, 10, 20] as const;
const DEFAULT_PAGE_SIZE = 5;

/** Boundary parse for the DOM string: "" (All) or an unknown value → null. */
function parseActivityAction(value: string): TicketActivityAction | null {
  return (TICKET_ACTIVITY_ACTIONS as readonly string[]).includes(value)
    ? (value as TicketActivityAction)
    : null;
}

/** Immutable ticket activity timeline, newest first, with server pagination
 * (default 5 per page; 5/10/20 selectable) and a server-side action filter. */
export function ActivityTimeline({ ticketId, pulseId, pulseUrl }: ActivityTimelineProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [action, setAction] = useState<TicketActivityAction | null>(null);
  const activityQuery = useTicketActivity(ticketId, page, pageSize, action);
  const entries = activityQuery.data?.items ?? [];
  const total = activityQuery.data?.total ?? 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Activity</h2>
      <label className="mt-2 flex flex-col gap-1 text-xs text-slate-500">
        Action
        <select
          aria-label="Filter by action"
          value={action ?? ""}
          onChange={(event) => {
            setAction(parseActivityAction(event.target.value));
            setPage(1);
          }}
          className="self-start rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700"
        >
          <option value="">All actions</option>
          {TICKET_ACTIVITY_ACTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
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
                <ActivityDetail
                  entry={entry}
                  pulseId={pulseId ?? null}
                  pulseUrl={pulseUrl ?? null}
                />
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
