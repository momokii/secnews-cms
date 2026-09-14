import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedItemsPage } from "./FeedItemsPage";
import { setToken } from "../../lib/tokenStore";

const unreviewedItem = {
  id: 5,
  feedSourceId: 1,
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
    // Given: the triage list shows an UNREVIEWED item and take returns ticket 7
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url.startsWith("/api/feed-items"),
        respond: () => envelope([unreviewedItem]),
      },
      {
        match: (url, method) =>
          method === "POST" && url === "/api/feed-items/5/take",
        respond: () =>
          new Response(JSON.stringify({ id: 7, title: "OpenSSL patch" }), {
            status: 201,
          }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the page renders and the analyst clicks Take
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Take" }));

    // Then: the take mutation fires and the row links to /tickets/7
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/feed-items/5/take",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const ticketLink = await screen.findByRole("link", { name: "Ticket #7" });
    expect(ticketLink.getAttribute("href")).toBe("/tickets/7");
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
