import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../lib/tokenStore";
import type { ExportAudit } from "../lib/exportsApi";
import { ReportsPage } from "./ReportsPage";
import { jsonResponse, paginated, renderWithProviders, routeFetch } from "./tickets/testUtils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

function auditFixture(overrides: Partial<ExportAudit> = {}): ExportAudit {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    actorId: "11111111-1111-4111-8111-111111111111",
    actorName: "Admin",
    type: "FEED",
    format: "CSV",
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-15T23:59:59.999Z",
    status: "SUCCESS",
    rowCount: 12,
    error: null,
    createdAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  };
}

function auditRoutes(rows: ExportAudit[] = [auditFixture()]): Array<{
  match: (url: string, method: string) => boolean;
  respond: () => Response;
}> {
  return [
    {
      match: (url, method) => method === "GET" && url.startsWith("/api/exports/audit"),
      respond: () => jsonResponse(paginated(rows)),
    },
  ];
}

describe("ReportsPage: export audit log table", () => {
  it("renders paginated table with actorName, createdAt via formatTimestamp, type/format/range/status/rowCount badges", async () => {
    setToken("test-token");
    const row = auditFixture();
    vi.stubGlobal("fetch", routeFetch(auditRoutes([row])));
    renderWithProviders(<ReportsPage />);

    // actorName
    expect(await screen.findByRole("cell", { name: "Admin" })).toBeTruthy();
    // createdAt formatted in WIB: 2026-09-15T10:00:00Z => 2026-09-15 17:00
    expect(screen.getByRole("cell", { name: "2026-09-15 17:00" })).toBeTruthy();
    // type badge FEED
    expect(screen.getByRole("cell", { name: "FEED" })).toBeTruthy();
    // format
    expect(screen.getByRole("cell", { name: "CSV" })).toBeTruthy();
    // status badge SUCCESS
    expect(screen.getByRole("cell", { name: "SUCCESS" })).toBeTruthy();
    // rowCount
    expect(screen.getByRole("cell", { name: "12" })).toBeTruthy();
    // range: from/to rendered via formatTimestamp
    expect(screen.getByText(/2026-09-01 07:00/)).toBeTruthy();
    expect(screen.getByText(/2026-09-16 06:59/)).toBeTruthy();
    // status badge carries emerald classes for SUCCESS
    const badges = screen.getAllByText("SUCCESS");
    const successBadge = badges.find((el) => el.className.includes("bg-emerald-100"));
    expect(successBadge).toBeTruthy();
    // headers present
    expect(screen.getByRole("columnheader", { name: "Actor" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Range" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Rows" })).toBeTruthy();
  });

  it("shows FAILED badge with red styling and renders fallback rowCount and actor", async () => {
    setToken("test-token");
    const row = auditFixture({
      actorName: null,
      type: "TICKET",
      format: "JSON",
      from: null,
      to: null,
      status: "FAILED",
      rowCount: null,
    });
    vi.stubGlobal("fetch", routeFetch(auditRoutes([row])));
    renderWithProviders(<ReportsPage />);

    expect(await screen.findByRole("cell", { name: "TICKET" })).toBeTruthy();
    const failed = await screen.findByRole("cell", { name: "FAILED" });
    expect(failed.textContent).toBe("FAILED");
    expect(failed.querySelector("span")?.className ?? failed.className).toContain("bg-red-100");
    // fallback for null actorName and null range and null rowCount
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("cell", { name: "JSON" })).toBeTruthy();
  });

  it("sends type, format and status filters as query params and resets to page 1", async () => {
    setToken("test-token");
    const fetchSpy = routeFetch(auditRoutes());
    vi.stubGlobal("fetch", fetchSpy);
    renderWithProviders(<ReportsPage />);

    await screen.findByRole("cell", { name: "Admin" });

    fireEvent.change(await screen.findByLabelText("Filter by type"), { target: { value: "TICKET" } });
    fireEvent.change(await screen.findByLabelText("Filter by format"), { target: { value: "JSON" } });
    fireEvent.change(await screen.findByLabelText("Filter by status"), { target: { value: "FAILED" } });

    await waitFor(() => {
      const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const hasAll = calls.some(([url]) =>
        String(url).includes("type=TICKET") &&
        String(url).includes("format=JSON") &&
        String(url).includes("status=FAILED") &&
        String(url).includes("page=1"),
      );
      expect(hasAll).toBe(true);
    });
  });

  it("sends DateFilter bounds and resets page", async () => {
    setToken("test-token");
    vi.setSystemTime(new Date("2026-09-14T03:00:00.000Z"));
    const fetchSpy = routeFetch(auditRoutes());
    vi.stubGlobal("fetch", fetchSpy);
    renderWithProviders(<ReportsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Today" }));

    await waitFor(() =>
      expect(
        (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls.some(
          ([url]) =>
            String(url).includes("from=2026-09-13T17%3A00%3A00.000Z") &&
            String(url).includes("to=2026-09-14T16%3A59%3A59.999Z") &&
            String(url).includes("page=1"),
        ),
      ).toBe(true),
    );
  });

  it("requests next page and custom pageSize", async () => {
    setToken("test-token");
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/exports/audit")) {
        return jsonResponse({ items: [auditFixture()], total: 41, page: url.includes("page=2") ? 2 : 1, pageSize: url.includes("pageSize=50") ? 50 : 20 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchSpy);
    renderWithProviders(<ReportsPage />);

    await screen.findByRole("cell", { name: "Admin" });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("page=2"))).toBe(true),
    );

    fireEvent.change(screen.getByLabelText("Items per page"), { target: { value: "50" } });
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("pageSize=50"))).toBe(true),
    );
  });

  it("shows error alert when fetch fails", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 })),
    );
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("shows empty state when no exports", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (u, m) => m === "GET" && u.startsWith("/api/exports/audit"),
          respond: () => jsonResponse({ items: [], total: 0, page: 1, pageSize: 20 }),
        },
      ]),
    );
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText("No exports yet.")).toBeTruthy();
  });

  it("shows loading state while pending", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText("Loading reports…")).toBeTruthy();
  });
});
