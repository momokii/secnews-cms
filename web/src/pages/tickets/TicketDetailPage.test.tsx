import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { setToken, setUser } from "../../lib/tokenStore";
import {
  TICKET_ID,
  auditFixture,
  activityFixture,
  iocFixture,
  jsonResponse,
  paginated,
  routeFetch,
  suggestionFixture,
  ticketDetailFixture,
} from "./testUtils";
import { TicketDetailPage } from "./TicketDetailPage";

afterEach(() => {
  Reflect.deleteProperty(window.navigator, "clipboard");
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderDetail(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/tickets/${TICKET_ID}`]}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function detailRoutes(detail = ticketDetailFixture()) {
  return [
    {
      match: (url: string, method: string) =>
        method === "GET" && url === `/api/tickets/${TICKET_ID}`,
      respond: () => jsonResponse(detail),
    },
    {
      match: (url: string, method: string) =>
        method === "GET" && url.includes("/suggestions"),
      respond: () => jsonResponse(paginated([suggestionFixture()])),
    },
    {
      match: (url: string, method: string) =>
        method === "GET" && url.endsWith("/integrations/available"),
      respond: () => jsonResponse([]),
    },
    {
      match: (url: string, method: string) =>
        method === "GET" && url.includes("/delivery-audit"),
      respond: () => jsonResponse(paginated([auditFixture()])),
    },
    {
      match: (url: string, method: string) =>
        method === "GET" && url.includes("/activity"),
      respond: () => jsonResponse(paginated([activityFixture()])),
    },
  ];
}

describe("TicketDetailPage: workspace composition", () => {
  it("renders every workspace panel against the live detail shape", async () => {
    setToken("test-token");
    setUser({ id: "7e1a9c3b-5d2f-48e4-b6a8-9c0d2e4f6a8b", email: "e@example.com", name: "Editor", role: "EDITOR" });
    vi.stubGlobal(
      "fetch",
      routeFetch(
        detailRoutes(
          ticketDetailFixture({
            sources: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                ticketId: TICKET_ID,
                url: "https://openssl.org/advisory",
                note: null,
                createdById: null,
                createdAt: "2026-09-14T08:00:00.000Z",
              },
            ],
            iocs: [iocFixture()],
          }),
        ),
      ),
    );
    renderDetail();

    // Action bar per role/state (EDITOR on READY → Mark sent + Close ticket).
    expect(await screen.findByRole("button", { name: "Mark sent" })).toBeTruthy();
    // Final-fields form.
    expect(screen.getByLabelText("Overview")).toBeTruthy();
    // AI panel.
    expect(screen.getByRole("button", { name: "AI fill (strict)" })).toBeTruthy();
    expect(await screen.findByText("PENDING")).toBeTruthy();
    // Sources editor.
    expect(screen.getByRole("link", { name: "https://openssl.org/advisory" })).toBeTruthy();
    // IOC table.
    expect(screen.getByRole("cell", { name: "evil.example" })).toBeTruthy();
    // Audit timeline.
    expect(screen.getByText(/Acme SOC/)).toBeTruthy();
    expect(screen.getByText("Activity")).toBeTruthy();
    expect(screen.getByText("Status: OPEN → RESEARCH")).toBeTruthy();
    expect(screen.getByText(/Editor/)).toBeTruthy();
  });

  it("shows the hard-block banner and disables Send/OTX while suggestions are pending", async () => {
    setToken("test-token");
    setUser({ id: "7e1a9c3b-5d2f-48e4-b6a8-9c0d2e4f6a8b", email: "e@example.com", name: "Editor", role: "EDITOR" });
    vi.stubGlobal(
      "fetch",
      routeFetch(detailRoutes(ticketDetailFixture({ pendingSuggestions: 1 }))),
    );
    renderDetail();

    await screen.findByRole("alert");
    expect(
      (screen.getByRole("button", { name: "Send to channels" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Push to OTX" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("raises the banner and disables Send when OTX push returns 409", async () => {
    setToken("test-token");
    setUser({ id: "7e1a9c3b-5d2f-48e4-b6a8-9c0d2e4f6a8b", email: "e@example.com", name: "Editor", role: "EDITOR" });
    const fetchMock = routeFetch([
      ...detailRoutes(),
      {
        match: (url: string, method: string) =>
          method === "POST" && url === `/api/tickets/${TICKET_ID}/otx`,
        respond: () =>
          jsonResponse(
            { error: { code: "PENDING_SUGGESTIONS", message: "1 unresolved AI suggestion(s) block sending", details: null } },
            409,
          ),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Push to OTX" }));

    await screen.findAllByRole("alert");
    expect(
      (screen.getByRole("button", { name: "Send to channels" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("POSTs the transition when an action-bar button is clicked", async () => {
    setToken("test-token");
    setUser({ id: "7e1a9c3b-5d2f-48e4-b6a8-9c0d2e4f6a8b", email: "e@example.com", name: "Editor", role: "EDITOR" });
    const fetchMock = routeFetch([
      ...detailRoutes(),
      {
        match: (url: string, method: string) =>
          method === "POST" && url === `/api/tickets/${TICKET_ID}/transition`,
        respond: () =>
          jsonResponse(ticketDetailFixture({ status: "SENT" })),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Mark sent" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/transition`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ to: "SENT" }),
        }),
      ),
    );
  });
});

describe("TASK-UXB: ticket ID chip", () => {
  it("renders the ID chip with the prefix, the full id in the title, and copies it", async () => {
    // Given: a loaded ticket and a working async clipboard
    setToken("test-token");
    setUser({ id: "7e1a9c3b-5d2f-48e4-b6a8-9c0d2e4f6a8b", email: "e@example.com", name: "Editor", role: "EDITOR" });
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    vi.stubGlobal("fetch", routeFetch(detailRoutes()));

    // When: the detail page renders and the operator copies the ID
    renderDetail();

    // Then: the chip shows the 8-char prefix and carries the full id in title
    expect(await screen.findByText(`ID ${TICKET_ID.slice(0, 8)}`)).toBeTruthy();
    const chip = screen.getByText(`ID ${TICKET_ID.slice(0, 8)}`).closest("span");
    expect(chip?.getAttribute("title")).toBe(TICKET_ID);

    // When: Copy is clicked
    fireEvent.click(screen.getByRole("button", { name: "Copy ticket ID" }));

    // Then: the full id lands on the clipboard and feedback shows
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TICKET_ID));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });
});
