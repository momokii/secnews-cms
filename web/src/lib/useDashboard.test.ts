import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { setToken } from "./tokenStore";
import {
  dashboardSummaryQueryKey,
  dashboardTimeseriesQueryKey,
  useDashboardSummary,
  useDashboardTimeseries,
} from "./useDashboard";

function createWrapper(): (props: { children: ReactNode }) => ReactNode {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const summary = {
  feedItems: { total: 3, byStatus: { UNREVIEWED: 2, TAKEN: 1 } },
  tickets: { total: 2, byStatus: { OPEN: 1, SENT: 1 } },
  deliveries: { sent: 5, failed: 1 },
};

const timeseries = {
  buckets: [
    {
      bucket: "2026-09-14T00:00:00.000Z",
      feedItems: 2,
      tickets: 1,
      deliveries: 3,
    },
  ],
};

describe("DASH-01: dashboard hooks are keyed by the from/to range", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("derives query keys from from/to so ranges cache independently", () => {
    // Given / When: keys are derived from range combinations
    // Then: absent bounds occupy null slots, present bounds their own value
    expect(dashboardSummaryQueryKey(undefined, undefined)).toEqual([
      "dashboard-summary",
      null,
      null,
    ]);
    expect(dashboardSummaryQueryKey("2026-09-01", "2026-09-15")).toEqual([
      "dashboard-summary",
      "2026-09-01",
      "2026-09-15",
    ]);
    expect(dashboardTimeseriesQueryKey("2026-09-01", undefined)).toEqual([
      "dashboard-timeseries",
      "2026-09-01",
      null,
    ]);
  });

  it("fetches /api/dashboard/summary with from and to as query params", async () => {
    // Given: a stored token and a stubbed summary API
    setToken("test-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(summary), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When: the summary hook renders with a range
    const { result } = renderHook(
      () => useDashboardSummary("2026-09-01", "2026-09-15"),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Then: the request hits the summary endpoint with the range and the
    // parsed payload keeps the aggregate shape
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/dashboard/summary?from=2026-09-01&to=2026-09-15",
    );
    expect(result.current.data).toEqual(summary);
  });

  it("omits range params when from/to are undefined", async () => {
    // Given: a stored token and a stubbed summary API
    setToken("test-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(summary), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When: the summary hook renders without a range
    const { result } = renderHook(() => useDashboardSummary(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Then: the request carries no query string
    expect(fetchMock.mock.calls[0][0]).toBe("/api/dashboard/summary");
  });

  it("fetches /api/dashboard/timeseries with range and day interval", async () => {
    // Given: a stored token and a stubbed timeseries API
    setToken("test-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(timeseries), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When: the timeseries hook renders with a from-only range
    const { result } = renderHook(
      () => useDashboardTimeseries("2026-09-01"),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Then: the request hits the timeseries endpoint and the buckets survive
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/dashboard/timeseries?from=2026-09-01&interval=day",
    );
    expect(result.current.data).toEqual(timeseries);
  });

  it("keeps previous range data visible while the next range loads", async () => {
    // Given: the first range answers immediately and the second stays in flight
    setToken("test-token");
    let resolveSecond: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(summary), { status: 200 }),
      )
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveSecond = resolve;
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    // When: the hook renders one range then rerenders with another
    const { rerender, result } = renderHook(
      (props: { from?: string; to?: string }) =>
        useDashboardSummary(props.from, props.to),
      {
        wrapper: createWrapper(),
        initialProps: { from: "2026-09-01", to: "2026-09-15" },
      },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ from: "2026-09-01", to: "2026-09-10" });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));

    // Then: the first range's data stays on screen while the next fetches
    expect(result.current.data).toEqual(summary);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/dashboard/summary?from=2026-09-01&to=2026-09-10",
    );

    resolveSecond?.(new Response(JSON.stringify(summary), { status: 200 }));
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
  });
});
