import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import {
  TICKET_ID,
  auditFixture,
  jsonResponse,
  paginated,
  renderWithProviders,
  routeFetch,
} from "./testUtils";
import { AuditTimeline } from "./AuditTimeline";

function auditFetchMockRoute(): ReturnType<typeof routeFetch> {
  return routeFetch([
    {
      match: (url, method) =>
        method === "GET" && url.includes("/delivery-audit"),
      respond: () =>
        jsonResponse({ ...paginated([auditFixture()]), total: 11 }),
    },
  ]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("FE-AUD-01: delivery audit timeline", () => {
  it("renders one row per target with status badge and exact payload", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.includes("/delivery-audit"),
          respond: () =>
            jsonResponse(
              paginated([
                auditFixture(),
                auditFixture({
                  id: "2b3c4d5e-6f70-4122-8324-252627282930",
                  channelType: "EMAIL",
                  clientName: "Globex",
                  target: "bcc:soc@globex.example",
                  payload: "Bulletin body for Acme fallback channel",
                  status: "FAILED",
                  errorDetail: "SMTP relay refused",
                }),
              ]),
            ),
        },
      ]),
    );
    renderWithProviders(<AuditTimeline ticketId={TICKET_ID} />);

    expect(await screen.findByText(/Acme SOC/)).toBeTruthy();
    expect(screen.getByText(/Globex/)).toBeTruthy();
    expect(screen.getByText("SENT")).toBeTruthy();
    expect(screen.getByText("FAILED")).toBeTruthy();
    expect(screen.getByText("SMTP relay refused")).toBeTruthy();

    // The exact payload is preserved, collapsible but present (AUD-01).
    const payload = screen.getByText("Bulletin body for CVE-2026-1234");
    expect(payload).toBeTruthy();
  });

  it("shows the empty state before any delivery attempt", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.includes("/delivery-audit"),
          respond: () => jsonResponse(paginated([])),
        },
      ]),
    );
    renderWithProviders(<AuditTimeline ticketId={TICKET_ID} />);

    expect(await screen.findByText("No delivery attempts yet.")).toBeTruthy();
  });

  it("requests the next page when Next is clicked", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url.includes("/delivery-audit"),
        respond: () => jsonResponse({ ...paginated([auditFixture()]), total: 41 }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<AuditTimeline ticketId={TICKET_ID} />);

    await screen.findByText(/Acme SOC/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/delivery-audit?page=2"),
        expect.anything(),
      ),
    );
  });
});

describe("TASK-UXT: audit page size", () => {
  it("defaults to 5 entries per page with the 5/10/20 selector", async () => {
    // Given: the audit trail has 11 entries on the server
    setToken("test-token");
    const fetchMock = auditFetchMockRoute();
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<AuditTimeline ticketId={TICKET_ID} />);
    await screen.findByText(/Acme SOC/);

    // Then: the initial request asks for page 1 at pageSize 5
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/delivery-audit?page=1&pageSize=5"),
      expect.anything(),
    );
    expect(screen.getByText("Page 1 of 3 — 11 entries")).toBeTruthy();

    // When: the page size changes to 20
    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "20" },
    });

    // Then: the refetch restarts at page 1 with pageSize 20
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/delivery-audit?page=1&pageSize=20"),
        expect.anything(),
      ),
    );
  });
});

describe("TASK-UXT: audit channel filter", () => {
  it("offers All channels plus WHATSAPP/TELEGRAM/EMAIL, defaulting to unfiltered", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", auditFetchMockRoute());
    renderWithProviders(<AuditTimeline ticketId={TICKET_ID} />);
    await screen.findByText(/Acme SOC/);

    const select = screen.getByLabelText("Filter by channel") as HTMLSelectElement;
    const names = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(names).toEqual(["All channels", "WHATSAPP", "TELEGRAM", "EMAIL"]);
    expect(select.value).toBe("");
  });

  it("filters the fetched page client-side when a channel is chosen", async () => {
    // Given: the current page holds a TELEGRAM and an EMAIL row
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.includes("/delivery-audit"),
          respond: () =>
            jsonResponse(
              paginated([
                auditFixture(),
                auditFixture({
                  id: "2b3c4d5e-6f70-4122-8324-252627282930",
                  channelType: "EMAIL",
                  clientName: "Globex",
                  target: "bcc:soc@globex.example",
                }),
              ]),
            ),
        },
      ]),
    );
    renderWithProviders(<AuditTimeline ticketId={TICKET_ID} />);
    await screen.findByText(/Acme SOC/);
    expect(screen.getByText(/Globex/)).toBeTruthy();

    // When: TELEGRAM is picked in the channel filter
    fireEvent.change(screen.getByLabelText("Filter by channel"), {
      target: { value: "TELEGRAM" },
    });

    // Then: only the TELEGRAM row stays visible (client-side filter; the
    // request URL carries no channel param — the backend has none)
    expect(screen.getByText(/Acme SOC/)).toBeTruthy();
    expect(screen.queryByText(/Globex/)).toBeNull();
  });

  it("resets to page 1 when the channel filter changes", async () => {
    // Given: the audit is paged to page 2
    setToken("test-token");
    const fetchMock = auditFetchMockRoute();
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<AuditTimeline ticketId={TICKET_ID} />);
    await screen.findByText(/Acme SOC/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/delivery-audit?page=2"),
        expect.anything(),
      ),
    );

    // When: a channel filter is applied
    fireEvent.change(screen.getByLabelText("Filter by channel"), {
      target: { value: "EMAIL" },
    });

    // Then: the refetch restarts at page 1
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/delivery-audit?page=1&pageSize=5"),
        expect.anything(),
      ),
    );
  });
});
