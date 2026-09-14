import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  vi.useRealTimers();
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

  it("sends a date preset and resets the list page", async () => {
    // Given: the ticket list is available and the clock is fixed in WIB
    setToken("test-token");
    vi.setSystemTime(new Date("2026-09-14T03:00:00.000Z"));
    const fetchMock = routeFetch(listRoutes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<TicketsListPage />);

    // When: Today is selected
    fireEvent.click(await screen.findByRole("button", { name: "Today" }));

    // Then: today's Jakarta bounds are sent and the request starts at page 1
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes("from=2026-09-13T17%3A00%3A00.000Z") &&
        String(url).includes("to=2026-09-14T16%3A59%3A59.999Z") &&
        String(url).includes("page=1"),
      )).toBe(true),
    );
  });

  it("opens the manual create-ticket dialog from the header button", async () => {
    // Given: the ticket list is rendered
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(listRoutes()));
    renderWithProviders(<TicketsListPage />);
    await screen.findByRole("link", { name: "OpenSSL vulnerability" });

    // When: Create ticket is clicked
    fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));

    // Then: the manual create dialog appears with its fields
    const dialog = await screen.findByRole("dialog", { name: "Create ticket" });
    expect(within(dialog).getByLabelText("Title")).toBeTruthy();
    expect(within(dialog).getByLabelText("Finding type")).toBeTruthy();
    expect(within(dialog).getByLabelText("Summary")).toBeTruthy();
  });

  it("renders the How tickets work explainer above the table", async () => {
    // Given: a signed-in user viewing the tickets list
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(listRoutes()));
    renderWithProviders(<TicketsListPage />);

    // When: the page renders
    const panel = await screen.findByRole("region", { name: "How tickets work" });
    const link = await screen.findByRole("link", { name: "OpenSSL vulnerability" });

    // Then: the panel sits above the table and documents the lifecycle,
    // TLP, finding types, origins and the send hard-block per STATES.md
    expect(panel.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(panel).getAllByText(/OPEN → RESEARCH → READY → SENT → CLOSED/).length).toBeGreaterThan(0);
    for (const tlp of ["CLEAR", "GREEN", "AMBER", "RED"]) {
      expect(within(panel).getAllByText(new RegExp(tlp)).length).toBeGreaterThan(0);
    }
    expect(within(panel).getByText(/default AMBER/)).toBeTruthy();
    expect(within(panel).getAllByText(/VULNERABILITY_CVE/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/THREAT_CAMPAIGN/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/AUTO_FEED/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/MANUAL/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/PENDING_SUGGESTIONS/).length).toBeGreaterThan(0);
  });
});
