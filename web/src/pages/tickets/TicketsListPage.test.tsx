import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import {
  TICKET_ID,
  jsonResponse,
  paginated,
  renderWithProviders,
  routeFetch,
  ticketDetailFixture,
} from "./testUtils";
import { TicketsListPage } from "./TicketsListPage";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const listTicket = ticketDetailFixture();

function listRoutes(): Array<{
  match: (url: string, method: string) => boolean;
  respond: () => Response;
}> {
  return [
    {
      match: (url, method) => method === "GET" && url.startsWith("/api/tickets?"),
      respond: () => jsonResponse(paginated([listTicket])),
    },
  ];
}

describe("FE-TKT-01: tickets list", () => {
  it("renders ticket rows with links to the detail workspace", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(listRoutes()));
    renderWithProviders(<TicketsListPage />);

    const link = await screen.findByRole("link", { name: "OpenSSL vulnerability" });
    expect(link.getAttribute("href")).toBe(`/tickets/${TICKET_ID}`);
    expect(screen.getByRole("cell", { name: "READY" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "AUTO_FEED" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "VULNERABILITY_CVE" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "2026-09-13 17:00" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Updated" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Taken By" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "2026-09-14 15:00" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "—" })).toBeTruthy();
  });

  it("sends the status filter as a query param", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(listRoutes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<TicketsListPage />);

    fireEvent.change(await screen.findByLabelText("Filter by status"), {
      target: { value: "READY" },
    });

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("status=READY"))).toBe(
        true,
      ),
    );
  });

  it("sends origin and findingType filters as query params", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(listRoutes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<TicketsListPage />);

    fireEvent.change(await screen.findByLabelText("Filter by origin"), {
      target: { value: "MANUAL" },
    });
    fireEvent.change(await screen.findByLabelText("Filter by finding type"), {
      target: { value: "THREAT_CAMPAIGN" },
    });

    await waitFor(() => {
      const combined = fetchMock.mock.calls.some(
        ([url]) =>
          String(url).includes("origin=MANUAL") &&
          String(url).includes("findingType=THREAT_CAMPAIGN"),
      );
      expect(combined).toBe(true);
    });
  });

  it("coalesces rapid search keystrokes into one debounced q request", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(listRoutes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<TicketsListPage />);

    const search = await screen.findByLabelText("Search tickets");
    fireEvent.change(search, { target: { value: "o" } });
    fireEvent.change(search, { target: { value: "op" } });
    fireEvent.change(search, { target: { value: "openssl" } });

    await waitFor(() => {
      const qCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("q=openssl"),
      );
      expect(qCalls).toHaveLength(1);
    });
    const qCount = fetchMock.mock.calls.filter(([url]) => String(url).includes("q=")).length;
    expect(qCount).toBe(1);
  });

  it("requests the next page when Next is clicked", async () => {
    setToken("test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const total = url.includes("page=1") ? 41 : 1;
      return jsonResponse({ ...paginated([listTicket]), total });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<TicketsListPage />);

    await screen.findByRole("link", { name: "OpenSSL vulnerability" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("page=2"))).toBe(
        true,
      ),
    );
  });

  it("refetches with the selected page size", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(listRoutes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<TicketsListPage />);

    await screen.findByRole("link", { name: "OpenSSL vulnerability" });
    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "100" },
    });

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("pageSize=100"))).toBe(
        true,
      ),
    );
  });
});
