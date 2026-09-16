import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchDashboardSummary,
  fetchDashboardTimeseries,
  type DashboardRange,
} from "./dashboardApi";

/** React Query bindings for the dashboard analytics. The from/to range owns
 * its queryKey slot; keepPreviousData holds the outgoing range's data on
 * screen while the next range fetches (no chart flicker on range change). */

export function dashboardSummaryQueryKey(
  from: string | undefined,
  to: string | undefined,
): readonly ["dashboard-summary", string | null, string | null] {
  return ["dashboard-summary", from ?? null, to ?? null];
}

export function dashboardTimeseriesQueryKey(
  from: string | undefined,
  to: string | undefined,
): readonly ["dashboard-timeseries", string | null, string | null] {
  return ["dashboard-timeseries", from ?? null, to ?? null];
}

export function useDashboardSummary(from?: string, to?: string) {
  return useQuery({
    queryKey: dashboardSummaryQueryKey(from, to),
    queryFn: () => fetchDashboardSummary({ from, to } satisfies DashboardRange),
    placeholderData: keepPreviousData,
  });
}

export function useDashboardTimeseries(from?: string, to?: string) {
  return useQuery({
    queryKey: dashboardTimeseriesQueryKey(from, to),
    queryFn: () =>
      fetchDashboardTimeseries({ from, to } satisfies DashboardRange),
    placeholderData: keepPreviousData,
  });
}
