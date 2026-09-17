import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { DateFilter } from "../components/DateFilter";
import type { DateRange } from "../lib/datetime";
import { useDashboardSummary, useDashboardTimeseries } from "../lib/useDashboard";

function byStatusEntries(record: Record<string, number | undefined>): Array<[string, number]> {
  return Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === "number");
}

const FEED_ITEMS_TOOLTIP = "Aggregated feed ingestion (RSS + external ingest) grouped by triage status (Unreviewed/Viewed/Taken) for selected range";
const TICKETS_TOOLTIP = "Work items (auto-feed or manual) grouped by workflow status (Open/Research/Ready/Sent/Closed)";
const DELIVERIES_TOOLTIP = "Outbound sends audited per channel (WhatsApp/Telegram/Email), success vs failed";

function InfoIcon({ title }: { title: string }) {
  return (
    <span title={title} className="flex items-center text-slate-400">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    </span>
  );
}

function isResizeObserverAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.ResizeObserver !== "undefined";
}

export function DashboardPage() {
  const [range, setRange] = useState<DateRange>({});
  const summary = useDashboardSummary(range.from, range.to);
  const timeseries = useDashboardTimeseries(range.from, range.to);

  const chartData = useMemo(
    () =>
      (timeseries.data?.buckets ?? []).map((bucket) => ({
        date: bucket.bucket.slice(0, 10),
        feedItems: bucket.feedItems,
        tickets: bucket.tickets,
        deliveries: bucket.deliveries,
      })),
    [timeseries.data],
  );

  const isLoading = summary.isPending || timeseries.isPending;
  const isError = summary.isError || timeseries.isError;
  const errorMessage =
    summary.error instanceof Error
      ? summary.error.message
      : timeseries.error instanceof Error
        ? timeseries.error.message
        : "Failed to load dashboard.";

  const hasSummary =
    summary.data !== undefined &&
    typeof (summary.data as unknown as { feedItems?: unknown }).feedItems !== "undefined" &&
    typeof (summary.data as { feedItems: { total: unknown } }).feedItems.total === "number" &&
    typeof (summary.data as { tickets: { total: unknown } }).tickets.total === "number" &&
    typeof (summary.data as { deliveries: { sent: unknown } }).deliveries.sent === "number";

  const totalsZero =
    hasSummary &&
    summary.data!.feedItems.total === 0 &&
    summary.data!.tickets.total === 0 &&
    summary.data!.deliveries.sent === 0 &&
    summary.data!.deliveries.failed === 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Operational KPIs and daily activity from the newsroom pipeline.</p>
        </div>
      </div>

      <DateFilter value={range} onChange={setRange} />

      {isLoading ? <p className="mt-4 text-sm text-slate-500">Loading dashboard…</p> : null}
      {isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}

      {hasSummary ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <article className="rounded-lg border border-slate-200 p-4">
              <h2 className="flex items-center gap-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Feed items
                <InfoIcon title={FEED_ITEMS_TOOLTIP} />
              </h2>
              <p className="mt-2 text-3xl font-bold text-slate-900">{summary.data!.feedItems.total}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {byStatusEntries(summary.data!.feedItems.byStatus as Record<string, number>).map(([status, count]) => (
                  <li key={status} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                    {status}: {count}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-lg border border-slate-200 p-4">
              <h2 className="flex items-center gap-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Tickets
                <InfoIcon title={TICKETS_TOOLTIP} />
              </h2>
              <p className="mt-2 text-3xl font-bold text-slate-900">{summary.data!.tickets.total}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {byStatusEntries(summary.data!.tickets.byStatus as Record<string, number>).map(([status, count]) => (
                  <li key={status} className="rounded bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700">
                    {status}: {count}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-lg border border-slate-200 p-4">
              <h2 className="flex items-center gap-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Deliveries
                <InfoIcon title={DELIVERIES_TOOLTIP} />
              </h2>
              <p className="mt-2 text-3xl font-bold text-slate-900">{summary.data!.deliveries.sent + summary.data!.deliveries.failed}</p>
              <div className="mt-2 flex gap-2">
                <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Sent: {summary.data!.deliveries.sent}</span>
                <span className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700">Failed: {summary.data!.deliveries.failed}</span>
              </div>
            </article>
          </div>
          {totalsZero ? <p className="mt-3 text-sm text-slate-500">No data for selected range.</p> : null}
        </>
      ) : null}

      <div className="mt-6 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Daily activity</h2>
        <p className="mt-1 text-xs text-slate-500">Bars for daily counts with feed-item trend line — filtered by the range above.</p>

        {timeseries.isPending ? (
          <p className="mt-4 text-sm text-slate-500">Loading chart…</p>
        ) : timeseries.isError ? (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {timeseries.error instanceof Error ? timeseries.error.message : "Failed to load timeseries."}
          </p>
        ) : chartData.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No timeseries data for selected range.</p>
        ) : isResizeObserverAvailable() ? (
          <div className="mt-4 h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 12 }} stroke="#64748b" allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="feedItems" name="Feed items" fill="#6366f1" barSize={18} radius={[4, 4, 0, 0]} />
                <Bar dataKey="tickets" name="Tickets" fill="#0ea5e9" barSize={18} radius={[4, 4, 0, 0]} />
                <Bar dataKey="deliveries" name="Deliveries" fill="#10b981" barSize={18} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="feedItems" name="Feed items (trend)" stroke="#4f46e5" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <ComposedChart width={640} height={280} data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#64748b" />
              <YAxis tick={{ fontSize: 12 }} stroke="#64748b" allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="feedItems" name="Feed items" fill="#6366f1" barSize={18} radius={[4, 4, 0, 0]} />
              <Bar dataKey="tickets" name="Tickets" fill="#0ea5e9" barSize={18} radius={[4, 4, 0, 0]} />
              <Bar dataKey="deliveries" name="Deliveries" fill="#10b981" barSize={18} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="feedItems" name="Feed items (trend)" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </ComposedChart>
          </div>
        )}
      </div>
    </section>
  );
}
