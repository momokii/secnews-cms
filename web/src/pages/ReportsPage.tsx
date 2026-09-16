import { useState } from "react";
import { DateFilter } from "../components/DateFilter";
import { Pagination } from "../components/Pagination";
import { formatTimestamp, type DateRange } from "../lib/datetime";
import { useExportAudits, type ExportFormat, type ExportStatus, type ExportType } from "../lib/exportsApi";

const TYPE_BADGE: Record<string, string> = {
  FEED: "bg-indigo-100 text-indigo-700",
  TICKET: "bg-violet-100 text-violet-700",
  feed: "bg-indigo-100 text-indigo-700",
  ticket: "bg-violet-100 text-violet-700",
};

const STATUS_BADGE: Record<ExportStatus, string> = {
  SUCCESS: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

const EXPORT_TYPES: readonly ExportType[] = ["FEED", "TICKET"] as const;
const EXPORT_FORMATS: readonly ExportFormat[] = ["CSV", "JSON", "XLSX"] as const;
const EXPORT_STATUSES: readonly ExportStatus[] = ["SUCCESS", "FAILED"] as const;

const selectClass =
  "rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none";

function formatRange(from: string | null, to: string | null): string {
  if (from === null && to === null) return "—";
  const left = from === null ? "—" : formatTimestamp(from);
  const right = to === null ? "—" : formatTimestamp(to);
  return `${left} → ${right}`;
}

export function ReportsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [type, setType] = useState<ExportType | "">("");
  const [format, setFormat] = useState<ExportFormat | "">("");
  const [status, setStatus] = useState<ExportStatus | "">("");

  const auditsQuery = useExportAudits({
    page,
    pageSize,
    type: type === "" ? undefined : type,
    format: format === "" ? undefined : format,
    status: status === "" ? undefined : status,
    from: dateRange.from,
    to: dateRange.to,
  });

  const audits = auditsQuery.data?.items ?? [];
  const total = auditsQuery.data?.total ?? 0;
  const effectivePageSize = auditsQuery.data?.pageSize ?? pageSize;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Reports</h1>

      <DateFilter
        value={dateRange}
        onChange={(range) => {
          setDateRange(range);
          setPage(1);
        }}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Type</span>
          <select
            aria-label="Filter by type"
            value={type}
            onChange={(event) => {
              setType(event.target.value as ExportType | "");
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">All types</option>
            {EXPORT_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Format</span>
          <select
            aria-label="Filter by format"
            value={format}
            onChange={(event) => {
              setFormat(event.target.value as ExportFormat | "");
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">All formats</option>
            {EXPORT_FORMATS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Status</span>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ExportStatus | "");
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">All statuses</option>
            {EXPORT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {auditsQuery.isPending ? (
        <p className="mt-4 text-sm text-slate-500">Loading reports…</p>
      ) : auditsQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {auditsQuery.error instanceof Error ? auditsQuery.error.message : "Failed to load reports."}
        </p>
      ) : audits.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No exports yet.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th scope="col" className="py-2 pr-4 font-medium">Actor</th>
              <th scope="col" className="py-2 pr-4 font-medium">Created</th>
              <th scope="col" className="py-2 pr-4 font-medium">Type</th>
              <th scope="col" className="py-2 pr-4 font-medium">Format</th>
              <th scope="col" className="py-2 pr-4 font-medium">Range</th>
              <th scope="col" className="py-2 pr-4 font-medium">Status</th>
              <th scope="col" className="py-2 font-medium">Rows</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-900">{row.actorName ?? "—"}</td>
                <td className="py-2 pr-4 text-slate-500">{formatTimestamp(row.createdAt)}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[row.type]}`}>{row.type}</span>
                </td>
                <td className="py-2 pr-4 text-slate-500">{row.format}</td>
                <td className="py-2 pr-4 text-slate-500">{formatRange(row.from, row.to)}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>{row.status}</span>
                </td>
                <td className="py-2 text-slate-500">{row.rowCount === null ? "—" : String(row.rowCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={page}
        pageSize={effectivePageSize}
        total={total}
        disabled={auditsQuery.isPlaceholderData}
        itemLabel="exports"
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </section>
  );
}
