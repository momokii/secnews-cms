import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { setToken, setUser } from "../../lib/tokenStore";
import {
  TICKET_ID,
  jsonResponse,
  paginated,
  renderWithProviders,
  routeFetch,
  suggestionFixture,
  ticketDetailFixture,
} from "./testUtils";
import { AiPanel } from "./AiPanel";
import { SourceDraftPanel } from "./SourceDraftPanel";
import { TicketDetailPage } from "./TicketDetailPage";
import type { TicketSource } from "../../lib/ticketsApi";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// helpers for TicketDetailPage unified banner
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

function detailRoutesWithPendingCounts(
  aiPendingTotal: number,
  sourcePendingTotal: number,
  _detail = ticketDetailFixture(),
) {
  return [
    {
      match: (url: string, method: string) =>
        method === "GET" && url === `/api/tickets/${TICKET_ID}`,
      respond: () => jsonResponse(_detail),
    },
    {
      // unified banner queries: status=PENDING & origin=...
      // Ai counts
      match: (url: string, method: string) =>
        method === "GET" &&
        url.includes("/suggestions") &&
        url.includes("status=PENDING") &&
        url.includes("FILL"),
      respond: () => jsonResponse({ items: [], total: aiPendingTotal, page: 1, pageSize: 1 }),
    },
    {
      match: (url: string, method: string) =>
        method === "GET" &&
        url.includes("/suggestions") &&
        url.includes("status=PENDING") &&
        url.includes("SOURCE_DRAFT"),
      respond: () => jsonResponse({ items: [], total: sourcePendingTotal, page: 1, pageSize: 1 }),
    },
    // fallback for non-pending suggestion lists (panel lists)
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
      respond: () => jsonResponse(paginated([])),
    },
    {
      match: (url: string, method: string) =>
        method === "GET" && url.includes("/activity"),
      respond: () => jsonResponse(paginated([])),
    },
  ];
}

describe("TASK-COMPACT: suggestion row truncation (160 chars)", () => {
  const LONG_VALUE = "a".repeat(250); // 250 chars

  it("truncates suggestedValue to 160 chars preview with Show more toggle per row", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () =>
            jsonResponse(
              paginated([suggestionFixture({ suggestedValue: LONG_VALUE })]),
            ),
        },
        {
          match: (url, method) => method === "GET" && url.endsWith("/integrations/available"),
          respond: () => jsonResponse([]),
        },
      ]),
    );
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    // Initially shows truncated preview (160 chars) plus toggle, not full 250
    const preview = LONG_VALUE.slice(0, 160);
    expect(await screen.findByText((content) => content.includes(preview))).toBeTruthy();
    // Full value should NOT be fully visible initially
    const fullText = screen.queryByText(LONG_VALUE);
    expect(fullText).toBeNull();

    // Show more toggle exists
    const showMore = screen.getByRole("button", { name: /Show more/i });
    expect(showMore).toBeTruthy();

    // Accept/Edit/Reject/Delete still visible in truncated state
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();

    // Expand shows full text with break-words and Show less
    fireEvent.click(showMore);
    expect(await screen.findByText(LONG_VALUE)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Show less/i })).toBeTruthy();
    // Still has actions after expand
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(screen.getByText(LONG_VALUE).className).toContain("break-words");

    // Collapse back
    fireEvent.click(screen.getByRole("button", { name: /Show less/i }));
    expect(screen.queryByText(LONG_VALUE)).toBeNull();
    expect(screen.getByRole("button", { name: /Show more/i })).toBeTruthy();
  });

  it("does not show toggle for short suggestedValue (<=160)", async () => {
    const short = "b".repeat(50);
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () => jsonResponse(paginated([suggestionFixture({ suggestedValue: short })])),
        },
        {
          match: (url, method) => method === "GET" && url.endsWith("/integrations/available"),
          respond: () => jsonResponse([]),
        },
      ]),
    );
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );
    expect(await screen.findByText(short)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show more/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Show less/i })).toBeNull();
  });

  it("state is per row: expanding one does not expand another", async () => {
    const longA = "x".repeat(200);
    const longB = "y".repeat(200);
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () =>
            jsonResponse(
              paginated([
                suggestionFixture({ id: "55555555-5555-4555-8555-555555555555", suggestedValue: longA }),
                suggestionFixture({ id: "66666666-6666-4666-8666-666666666666", field: "description", suggestedValue: longB }),
              ]),
            ),
        },
        {
          match: (url, method) => method === "GET" && url.endsWith("/integrations/available"),
          respond: () => jsonResponse([]),
        },
      ]),
    );
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );
    const showMoreButtons = await screen.findAllByRole("button", { name: /Show more/i });
    expect(showMoreButtons).toHaveLength(2);
    fireEvent.click(showMoreButtons[0] as HTMLButtonElement);
    expect(await screen.findByText(longA)).toBeTruthy();
    // second still truncated
    expect(screen.queryByText(longB)).toBeNull();
  });
});

describe("TASK-COMPACT: source picker preview truncation (100 chars)", () => {
  const LONG_NOTES = "n".repeat(180);

  function sourceLong(): TicketSource {
    return {
      id: "22222222-2222-4222-8222-222222222222",
      ticketId: TICKET_ID,
      url: "https://example.com/a",
      note: null,
      title: "Long source",
      notes: LONG_NOTES,
      createdById: null,
      createdAt: "2026-09-13T10:00:00.000Z",
    };
  }

  it("truncates sourcePreview to 100 chars with inline … Show more expand", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () => jsonResponse(paginated([])),
        },
        {
          match: (url, method) => method === "POST" && url.endsWith("/ai/source-draft"),
          respond: () => jsonResponse({ suggestions: [] }),
        },
      ]),
    );
    renderWithProviders(<SourceDraftPanel ticketId={TICKET_ID} sources={[sourceLong()]} />);

    const preview = LONG_NOTES.slice(0, 100);
    expect(await screen.findByText((c) => c.includes(preview))).toBeTruthy();
    expect(screen.queryByText(LONG_NOTES)).toBeNull();
    const toggle = screen.getByRole("button", { name: /Show more/i });
    expect(toggle).toBeTruthy();

    fireEvent.click(toggle);
    expect(await screen.findByText(LONG_NOTES)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Show less/i })).toBeTruthy();
    expect(screen.getByText(LONG_NOTES).className).toContain("break-words");

    // picker row itself should not blow out: preview element has break-words already verified
  });

  it("does not show toggle for short notes (<=100)", async () => {
    const shortNotes = "short note 123";
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () => jsonResponse(paginated([])),
        },
      ]),
    );
    renderWithProviders(
      <SourceDraftPanel
        ticketId={TICKET_ID}
        sources={[{ ...sourceLong(), notes: shortNotes }]}
      />,
    );
    expect(await screen.findByText(shortNotes)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show more/i })).toBeNull();
  });
});

describe("TASK-COMPACT: unified pending banner in TicketDetailPage", () => {
  it("removes banner from AiPanel: AiPanel alone shows no alert regardless of pending", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () => jsonResponse(paginated([suggestionFixture()])),
        },
        {
          match: (url, method) => method === "GET" && url.endsWith("/integrations/available"),
          respond: () => jsonResponse([]),
        },
      ]),
    );
    renderWithProviders(<AiPanel ticketId={TICKET_ID} pendingSuggestions={3} blocked={false} />);
    await screen.findByText("overview");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows unified banner below title with per-feature counts and hides when zero", async () => {
    setToken("test-token");
    setUser({ id: "7e1a9c3b-5d2f-48e4-b6a8-9c0d2e4f6a8b", email: "e@example.com", name: "Editor", role: "EDITOR" });
    vi.stubGlobal("fetch", routeFetch(detailRoutesWithPendingCounts(2, 1)));
    renderDetail();

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("3 unresolved suggestion");
    expect(banner.textContent).toContain("AI Assist: 2");
    expect(banner.textContent).toContain("Source Draft Assist: 1");
    expect(banner.textContent).toMatch(/Send.*OTX blocked|OTX.*Send/i);
    // amber styling near title
    expect(banner.className).toContain("bg-amber-50");
    expect(banner.className).toContain("border-amber-300");
  });

  it("when one origin zero, banner mentions only pending one", async () => {
    setToken("test-token");
    setUser({ id: "7e1a9c3b-5d2f-48e4-b6a8-9c0d2e4f6a8b", email: "e@example.com", name: "Editor", role: "EDITOR" });
    vi.stubGlobal("fetch", routeFetch(detailRoutesWithPendingCounts(2, 0)));
    renderDetail();
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("2 unresolved suggestion");
    expect(banner.textContent).toContain("AI Assist: 2");
    expect(banner.textContent).not.toContain("Source Draft Assist: 0");
  });

  it("when both zero, no banner", async () => {
    setToken("test-token");
    setUser({ id: "7e1a9c3b-5d2f-48e4-b6a8-9c0d2e4f6a8b", email: "e@example.com", name: "Editor", role: "EDITOR" });
    vi.stubGlobal("fetch", routeFetch(detailRoutesWithPendingCounts(0, 0)));
    renderDetail();
    await screen.findByText("OpenSSL vulnerability");
    // wait a tick for queries
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("unified banner contains anchor links to each section", async () => {
    setToken("test-token");
    setUser({ id: "7e1a9c3b-5d2f-48e4-b6a8-9c0d2e4f6a8b", email: "e@example.com", name: "Editor", role: "EDITOR" });
    vi.stubGlobal("fetch", routeFetch(detailRoutesWithPendingCounts(1, 1)));
    renderDetail();
    const banner = await screen.findByRole("alert");
    const links = banner.querySelectorAll("a");
    expect(links.length).toBeGreaterThanOrEqual(2);
    const hrefs = Array.from(links).map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("ai-assist"))).toBe(true);
    expect(hrefs.some((h) => h?.includes("source-draft"))).toBe(true);
  });
});
