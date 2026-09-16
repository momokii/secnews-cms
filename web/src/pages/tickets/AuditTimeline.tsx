import { useState } from "react";
import { Pagination } from "../../components/Pagination";
import { CHANNEL_TYPES, type ChannelType, type DeliveryAudit } from "../../lib/ticketsApi";
import { useDeliveryAudit } from "../../lib/useTickets";

interface AuditTimelineProps {
  ticketId: string;
}

const AUDIT_PAGE_SIZES = [5, 10, 20] as const;
const DEFAULT_PAGE_SIZE = 5;

const STATUS_CLASSES: Readonly<Record<DeliveryAudit["status"], string>> = {
  SENT: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

type ChannelFilter = ChannelType | null;

function parseChannelFilter(value: string): ChannelFilter {
  return (CHANNEL_TYPES as readonly string[]).includes(value)
    ? (value as ChannelType)
    : null;
}

/** Delivery audit trail (AUD-01): one immutable row per target per attempt,
 * preserving the exact payload that was sent. Server-paginated (default 5
 * per page; 5/10/20 selectable). The channel filter is client-side over the
 * fetched page — the backend delivery-audit endpoint has no ?channel= param. */
export function AuditTimeline({ ticketId }: AuditTimelineProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [channel, setChannel] = useState<ChannelFilter>(null);
  const auditQuery = useDeliveryAudit(ticketId, page, pageSize);

  const audit = (auditQuery.data?.items ?? []).filter(
    (row) => channel === null || row.channelType === channel,
  );
  const total = auditQuery.data?.total ?? 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Delivery audit</h2>

      <label className="mt-2 flex flex-col gap-1 text-xs text-slate-500">
        Channel
        <select
          aria-label="Filter by channel"
          value={channel ?? ""}
          onChange={(event) => {
            setChannel(parseChannelFilter(event.target.value));
            setPage(1);
          }}
          className="self-start rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700"
        >
          <option value="">All channels</option>
          {CHANNEL_TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      {auditQuery.isPending ? (
        <p className="mt-2 text-sm text-slate-500">Loading audit trail…</p>
      ) : auditQuery.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {auditQuery.error instanceof Error
            ? auditQuery.error.message
            : "Failed to load delivery audit."}
        </p>
      ) : audit.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No delivery attempts yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {audit.map((row) => (
            <li key={row.id} className="border-b border-slate-100 pb-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">
                  {row.channelType} → {row.clientName}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[row.status]}`}
                >
                  {row.status}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(row.sentAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Target: {row.target}</p>
              {row.errorDetail !== null ? (
                <p className="mt-1 text-xs text-red-600">{row.errorDetail}</p>
              ) : null}
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                  Payload
                </summary>
                <pre className="mt-1 overflow-x-auto rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                  {row.payload}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        disabled={auditQuery.isPlaceholderData}
        itemLabel="entries"
        itemLabelOne="entry"
        options={AUDIT_PAGE_SIZES}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </section>
  );
}
