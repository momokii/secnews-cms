import { apiFetch } from "./api";

/** Wire types + fetch functions for the read-only dashboard analytics
 * (GET /dashboard/summary, GET /dashboard/timeseries). Queries carry an
 * optional inclusive from/to range (date or full datetime); responses are
 * aggregate counts only — no row payloads (mirrors src/modules/dashboard). */

export type FeedItemStatus = "UNREVIEWED" | "VIEWED" | "TAKEN";
export type TicketStatus = "OPEN" | "RESEARCH" | "READY" | "SENT" | "CLOSED";

/** Inclusive range bound — date-only ("2026-09-01") or full ISO datetime. */
export interface DashboardRange {
  from?: string;
  to?: string;
}

/** Per-status counts as produced by a group-by — zero-count statuses are
 * absent rather than zero-filled. */
export type ByStatus<S extends string> = Partial<Record<S, number>>;

export interface DashboardSummary {
  feedItems: { total: number; byStatus: ByStatus<FeedItemStatus> };
  tickets: { total: number; byStatus: ByStatus<TicketStatus> };
  deliveries: { sent: number; failed: number };
}

export interface TimeseriesBucket {
  /** Bucket start instant (UTC midnight for the day interval). */
  bucket: string;
  feedItems: number;
  tickets: number;
  deliveries: number;
}

export interface DashboardTimeseries {
  buckets: TimeseriesBucket[];
}

/** Shared URL builder — bounds appended only when present. */
function rangeSearch(range: DashboardRange): URLSearchParams {
  const search = new URLSearchParams();
  if (range.from !== undefined) {
    search.set("from", range.from);
  }
  if (range.to !== undefined) {
    search.set("to", range.to);
  }
  return search;
}

export async function fetchDashboardSummary(
  range: DashboardRange = {},
): Promise<DashboardSummary> {
  const search = rangeSearch(range);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await apiFetch(`/dashboard/summary${suffix}`, {
    method: "GET",
  });
  return (await response.json()) as DashboardSummary;
}

export async function fetchDashboardTimeseries(
  range: DashboardRange = {},
): Promise<DashboardTimeseries> {
  const search = rangeSearch(range);
  search.set("interval", "day");
  const response = await apiFetch(`/dashboard/timeseries?${search.toString()}`, {
    method: "GET",
  });
  return (await response.json()) as DashboardTimeseries;
}
