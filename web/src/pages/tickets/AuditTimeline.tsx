import { useState } from "react";
import type { DeliveryAudit } from "../../lib/ticketsApi";
import { useDeliveryAudit } from "../../lib/useTickets";

interface AuditTimelineProps {
  ticketId: string;
}

const STATUS_CLASSES: Readonly<Record<DeliveryAudit["status"], string>> = {
  SENT: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

/** Delivery audit trail (AUD-01): one immutable row per target per attempt,
 * preserving the exact payload that was sent. */
export function AuditTimeline({ ticketId }: AuditTimelineProps) {
  const [page, setPage] = useState(1);
  const auditQuery = useDeliveryAudit(ticketId, page);

  const audit = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const pageSize = auditQuery.data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Delivery audit</h2>

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

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {page} of {totalPages} — {total} entries
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || auditQuery.isPlaceholderData}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= totalPages || auditQuery.isPlaceholderData}
            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </span>
      </div>
    </section>
  );
}
