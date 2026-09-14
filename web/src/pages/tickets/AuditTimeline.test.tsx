import { fireEvent, screen, waitFor } from "@testing-library/react";
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
