import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedItemsPage } from "./FeedItemsPage";
import { setToken } from "../../lib/tokenStore";

const ITEM_ID = "5e9f8a7b-6c5d-4e3f-8a2b-1c0d9e8f7a6b";
const TAKEN_TICKET_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const unreviewedItem = {
  id: ITEM_ID,
  feedSourceId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  guid: "g5",
  title: "OpenSSL patch",
  url: "https://example.com/a",
  publishedAt: "2026-09-13T10:00:00.000Z",
  summary: null,
  status: "UNREVIEWED",
  ticketId: null,
  fetchedAt: "2026-09-14T08:00:00.000Z",
};

function envelope(items: unknown[]): Response {
  return new Response(
    JSON.stringify({ items, total: items.length, page: 1, pageSize: 20 }),
    { status: 200 },
  );
}

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FeedItemsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function routeFetch(
  routes: Array<{
    match: (url: string, method: string) => boolean;
    respond: () => Response;
  }>,
): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const route = routes.find((candidate) => candidate.match(url, method));
    if (route === undefined) {
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }
    return route.respond();
  });
}

describe("FE-ITEM-02: take action spawns a ticket link", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("POSTs /feed-items/:id/take on Take and renders a link to the spawned ticket", async () => {
    // Given: the triage list shows an UNREVIEWED item and take returns the spawned ticket
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url.startsWith("/api/feed-items"),
        respond: () => envelope([unreviewedItem]),
      },
      {
        match: (url, method) =>
          method === "POST" && url === `/api/feed-items/${ITEM_ID}/take`,
        respond: () =>
          new Response(JSON.stringify({ id: TAKEN_TICKET_ID, title: "OpenSSL patch" }), {
            status: 201,
          }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the page renders and the analyst clicks Take
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Take" }));

    // Then: the take mutation fires and the row links to the spawned ticket
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/feed-items/${ITEM_ID}/take`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const ticketLink = await screen.findByRole("link", { name: `Ticket #${TAKEN_TICKET_ID}` });
    expect(ticketLink.getAttribute("href")).toBe(`/tickets/${TAKEN_TICKET_ID}`);
  });

  it("coalesces rapid keystrokes into one debounced q request", async () => {
    // Given: the triage list API and a stored token
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url.startsWith("/api/feed-items"),
        respond: () => envelope([]),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the analyst types "ssl" in quick successive keystrokes
    renderPage();
    const search = await screen.findByLabelText("Search");
    fireEvent.change(search, { target: { value: "s" } });
    fireEvent.change(search, { target: { value: "ss" } });
    fireEvent.change(search, { target: { value: "ssl" } });

    // Then: only one request carries q, and it carries the final value
    await waitFor(() => {
      const qCalls = fetchMock.mock.calls.filter(
        ([url]) => String(url).includes("q=ssl"),
      );
      expect(qCalls).toHaveLength(1);
    });
    const qCount = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("q="),
    ).length;
    expect(qCount).toBe(1);
  });
});
