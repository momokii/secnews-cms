import { useState } from "react";
import { Pagination } from "../../components/Pagination";
import { formatTimestamp } from "../../lib/datetime";
import type { TicketActivity } from "../../lib/ticketsApi";
import { useTicketActivity } from "../../lib/useTickets";

interface ActivityTimelineProps {
  ticketId: string;
  /** Ticket-confirmed pulse — lets OTX_PUSHED entries link to their pulse. */
  pulseId?: string | null;
  pulseUrl?: string | null;
}

const ACTIVITY_PAGE_SIZES = [5, 10, 20] as const;
const DEFAULT_PAGE_SIZE = 5;

const UPDATED_SUFFIX = " (updated)";

/** Wire detail is "status <FROM>→<TO>"; unparseable shapes render verbatim. */
function statusChangeDetail(detail: string): string {
  const match = /^status (\S+)→(\S+)$/.exec(detail);
  return match === null ? detail : `Status: ${match[1]} → ${match[2]}`;
}

/** Wire detail is the pulse id plus an optional "(updated)" marker. */
function splitOtxDetail(detail: string): { pulseId: string; updated: boolean } {
  const updated = detail.endsWith(UPDATED_SUFFIX);
  return {
    pulseId: updated ? detail.slice(0, -UPDATED_SUFFIX.length) : detail,
    updated,
  };
}

/** Detail line per action. The backend logs field-edit names only and pulse
 * ids only — both rendered honestly, never with invented values. */
function ActivityDetail({
  entry,
  pulseId,
  pulseUrl,
}: {
  entry: TicketActivity;
  pulseId: string | null;
  pulseUrl: string | null;
}) {
  if (entry.detail === null) {
    return null;
  }
  if (entry.action === "STATUS_CHANGED") {
    return (
      <p className="mt-1 text-xs text-slate-600">{statusChangeDetail(entry.detail)}</p>
    );
  }
  if (entry.action === "FIELDS_UPDATED") {
    const names = entry.detail
      .split(",")
      .map((name) => name.trim())
      .join(", ");
    return (
      <p className="mt-1 text-xs text-slate-600">
        <span>Updated fields: {names}</span>
        {" — "}
        <span className="text-slate-500">previous values are not recorded</span>
      </p>
    );
  }
  if (entry.action === "OTX_PUSHED") {
    const { pulseId: entryPulseId, updated } = splitOtxDetail(entry.detail);
    const confirmed = pulseUrl !== null && pulseId === entryPulseId;
    return (
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
          OTX push detail
        </summary>
        <p className="mt-1 text-xs text-slate-600">
          <span>
            {entryPulseId}
            {updated ? UPDATED_SUFFIX : ""}
          </span>
          {confirmed ? (
            <>
              {" — "}
              <a
                href={pulseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:text-indigo-500"
              >
                View on OTX
              </a>
            </>
          ) : null}
        </p>
      </details>
    );
  }
  return <p className="mt-1 text-xs text-slate-600">{entry.detail}</p>;
}

/** Immutable ticket activity timeline, newest first, with server pagination
 * (default 5 per page; 5/10/20 selectable via the shared Pagination footer). */
export function ActivityTimeline({ ticketId, pulseId, pulseUrl }: ActivityTimelineProps) {
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
