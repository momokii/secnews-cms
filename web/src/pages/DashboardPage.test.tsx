import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import { setToken } from "../lib/tokenStore";

const summaryPayload = {
  feedItems: { total: 12, byStatus: { UNREVIEWED: 7, VIEWED: 3, TAKEN: 2 } },
  tickets: { total: 5, byStatus: { OPEN: 2, RESEARCH: 1, READY: 1, SENT: 1 } },
  deliveries: { sent: 9, failed: 1 },
};

const timeseriesPayload = {
  buckets: [
    { bucket: "2026-09-14T00:00:00.000Z", feedItems: 4, tickets: 1, deliveries: 2 },
    { bucket: "2026-09-15T00:00:00.000Z", feedItems: 8, tickets: 4, deliveries: 7 },
  ],
};

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function routeFetch(
  routes: Array<{ match: (url: string, method: string) => boolean; respond: () => Response }>,
): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const route = routes.find((c) => c.match(url, method));
    if (route === undefined) throw new Error(`Unexpected fetch: ${method} ${url}`);
    return route.respond();
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("DASH-02: DashboardPage KPI cards and timeseries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("shows loading then KPI cards for feedItems/tickets/deliveries with byStatus", async () => {
    // Given: dashboard summary + timeseries endpoints answering
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) => method === "GET" && url.startsWith("/api/dashboard/summary"),
        respond: () => jsonResponse(summaryPayload),
      },
      {
        match: (url, method) => method === "GET" && url.startsWith("/api/dashboard/timeseries"),
        respond: () => jsonResponse(timeseriesPayload),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the dashboard renders
    renderPage();

    // Then: loading states appear
    expect(screen.getByText("Loading dashboard…")).toBeTruthy();

    // Then: KPI totals and byStatus resolve
    expect(await screen.findByRole("heading", { name: "Feed items" })).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("UNREVIEWED: 7")).toBeTruthy();
    expect(screen.getByText("VIEWED: 3")).toBeTruthy();
    expect(screen.getByText("TAKEN: 2")).toBeTruthy();

    expect(screen.getByRole("heading", { name: "Tickets" })).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("OPEN: 2")).toBeTruthy();

    expect(screen.getByRole("heading", { name: "Deliveries" })).toBeTruthy();
    expect(screen.getByText(/Sent: 9/)).toBeTruthy();
    expect(screen.getByText(/Failed: 1/)).toBeTruthy();
  });

  it("renders ComposedChart daily buckets for feedItems/tickets/deliveries", async () => {
    // Given: summary + two daily buckets
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) => method === "GET" && url.startsWith("/api/dashboard/summary"),
          respond: () => jsonResponse(summaryPayload),
        },
        {
          match: (url, method) => method === "GET" && url.startsWith("/api/dashboard/timeseries"),
          respond: () => jsonResponse(timeseriesPayload),
        },
      ]),
    );

    // When: the dashboard renders
    renderPage();
    await screen.findByRole("heading", { name: "Feed items" });

    // Then: daily bucket dates appear as XAxis ticks and legend entries exist
    expect(await screen.findByText("Daily activity")).toBeTruthy();
    expect(screen.getByText("2026-09-14")).toBeTruthy();
    expect(screen.getByText("2026-09-15")).toBeTruthy();
  });

  it("shows empty states when there is no data", async () => {
    // Given: zero totals and no buckets
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) => method === "GET" && url.startsWith("/api/dashboard/summary"),
          respond: () =>
            jsonResponse({
              feedItems: { total: 0, byStatus: {} },
              tickets: { total: 0, byStatus: {} },
              deliveries: { sent: 0, failed: 0 },
            }),
        },
        {
          match: (url, method) => method === "GET" && url.startsWith("/api/dashboard/timeseries"),
          respond: () => jsonResponse({ buckets: [] }),
        },
      ]),
    );

    // When: the dashboard renders
    renderPage();
    await screen.findByRole("heading", { name: "Feed items" });

    // Then: empty messages for KPIs and chart
    expect(screen.getByText("No data for selected range.")).toBeTruthy();
    expect(screen.getByText("No timeseries data for selected range.")).toBeTruthy();
  });

  it("refetches summary and timeseries when DateFilter changes", async () => {
    // Given: dashboard on a fixed clock with stubbed endpoints
    setToken("test-token");
    vi.setSystemTime(new Date("2026-09-14T03:00:00.000Z"));
    const fetchMock = routeFetch([
      {
        match: (url, method) => method === "GET" && url.startsWith("/api/dashboard/summary"),
        respond: () => jsonResponse(summaryPayload),
      },
      {
        match: (url, method) => method === "GET" && url.startsWith("/api/dashboard/timeseries"),
        respond: () => jsonResponse(timeseriesPayload),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByRole("heading", { name: "Feed items" });
    const initialSummaryCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).startsWith("/api/dashboard/summary"),
    ).length;

    // When: Today preset is selected (Jakarta day bounds)
    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    // Then: both summary and timeseries refetch with from/to plus interval=day
    await waitFor(() => {
      const summaryCalls = fetchMock.mock.calls.filter(([u]) =>
        String(u).startsWith("/api/dashboard/summary"),
      );
      expect(summaryCalls.length).toBeGreaterThan(initialSummaryCalls);
      const lastSummary = String(summaryCalls.at(-1)?.[0] ?? "");
      expect(lastSummary).toContain("from=2026-09-13T17%3A00%3A00.000Z");
      expect(lastSummary).toContain("to=2026-09-14T16%3A59%3A59.999Z");
    });
    await waitFor(() => {
      const tsCalls = fetchMock.mock.calls.filter(([u]) =>
        String(u).startsWith("/api/dashboard/timeseries"),
      );
      const lastTs = String(tsCalls.at(-1)?.[0] ?? "");
      expect(lastTs).toContain("from=2026-09-13T17%3A00%3A00.000Z");
      expect(lastTs).toContain("interval=day");
    });
  });

  it("shows error alert when dashboard fetch fails", async () => {
    // Given: API returns 500
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 })),
    );

    // When: the dashboard renders
    renderPage();

    // Then: error alert appears (summary and timeseries may each emit one)
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThanOrEqual(1);
  });
});
