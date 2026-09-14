import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  sourceName: "CISA Advisories",
};

const reviewedItem = {
  ...unreviewedItem,
  id: "8b1c2d3e-4f50-6a7b-8c9d-0e1f2a3b4c5d",
  guid: "g6",
  status: "VIEWED",
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

  it("renders Source and Asia/Jakarta Published columns, then refetches at the chosen page size", async () => {
    // Given: the triage list shows one item from a named source published at
    // 10:00 UTC (17:00 WIB)
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url.startsWith("/api/feed-items"),
        respond: () => envelope([unreviewedItem]),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // Then: the Source cell shows the feed name and Published is the WIB
    // date+hour:min, with the raw ISO instant in the title attribute
    expect(await screen.findByRole("cell", { name: "CISA Advisories" })).toBeTruthy();
    const publishedCell = screen.getByRole("cell", { name: "2026-09-13 17:00" });
    expect(publishedCell.getAttribute("title")).toBe("2026-09-13T10:00:00.000Z");

    // When: the analyst picks 50 per page
    fireEvent.change(await screen.findByLabelText("Items per page"), {
      target: { value: "50" },
    });

    // Then: the list refetches with pageSize=50
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("pageSize=50")),
      ).toBe(true),
    );
  });

  it("sends preset, custom, and cleared date filters", async () => {
    // Given: the feed item list is available and the clock is fixed in WIB
    setToken("test-token");
    vi.setSystemTime(new Date("2026-09-14T03:00:00.000Z"));
    const fetchMock = routeFetch([
      {
        match: (url, method) => method === "GET" && url.startsWith("/api/feed-items"),
        respond: () => envelope([]),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // When: Today is selected, then a custom range, then Clear
    fireEvent.click(await screen.findByRole("button", { name: "Today" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes("from=2026-09-13T17%3A00%3A00.000Z") &&
        String(url).includes("to=2026-09-14T16%3A59%3A59.999Z"),
      )).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-03" } });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes("from=2026-08-31T17%3A00%3A00.000Z") &&
        String(url).includes("to=2026-09-03T16%3A59%3A59.999Z"),
      )).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    // Then: clearing removes both bounds from the request
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) =>
        !String(url).includes("from=") && !String(url).includes("to="),
      )).toBe(true),
    );
  });
});

describe("FE-ITEM-03: Added column and details modal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("renders an Added column with the WIB ingest time and raw ISO title", async () => {
    // Given: the list shows an item ingested at 08:00 UTC (15:00 WIB)
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url.startsWith("/api/feed-items"),
        respond: () => envelope([unreviewedItem]),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the page renders
    renderPage();

    // Then: an Added cell shows the WIB date+hour:min with the raw ISO
    // instant in the title attribute, after the Published column
    const addedCell = await screen.findByRole("cell", { name: "2026-09-14 15:00" });
    expect(addedCell.getAttribute("title")).toBe("2026-09-14T08:00:00.000Z");
    const headers = screen.getAllByRole("columnheader");
    const labels = headers.map((header) => header.textContent);
    expect(labels.indexOf("Added")).toBe(labels.indexOf("Published") + 1);
  });

  it("Details opens a modal with normalized fields and the raw JSON, and marks UNREVIEWED as viewed", async () => {
    // Given: an UNREVIEWED item whose detail endpoint answers with raw
    setToken("test-token");
    const detailPayload = {
      ...unreviewedItem,
      summary: "CVE-2026-1234 affects OpenSSL 3.x; patch released.",
      raw: { title: "OpenSSL patch", creator: "CISA" },
    };
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url === `/api/feed-items/${ITEM_ID}`,
        respond: () => new Response(JSON.stringify(detailPayload), { status: 200 }),
      },
      {
        match: (url, method) =>
          method === "GET" && url.startsWith("/api/feed-items"),
        respond: () => envelope([unreviewedItem]),
      },
      {
        match: (url, method) =>
          method === "POST" && url === `/api/feed-items/${ITEM_ID}/view`,
        respond: () =>
          new Response(JSON.stringify({ ...unreviewedItem, status: "VIEWED" }), {
            status: 200,
          }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // When: the analyst opens Details on the UNREVIEWED row
    fireEvent.click(await screen.findByRole("button", { name: "Details" }));

    // Then: the modal shows the normalized fields including Added WIB and
    // the verbatim raw JSON, and the view mutation fires for the UNREVIEWED row
    const dialog = await screen.findByRole("dialog", { name: "Item details" });
    expect(within(dialog).getByText("OpenSSL patch")).toBeTruthy();
    expect(within(dialog).getByText("CISA Advisories")).toBeTruthy();
    const urlLink = within(dialog).getByRole("link", { name: "https://example.com/a" });
    expect(urlLink.getAttribute("href")).toBe("https://example.com/a");
    expect(within(dialog).getByText("2026-09-13 17:00 WIB")).toBeTruthy();
    expect(within(dialog).getByText("2026-09-14 15:00 WIB")).toBeTruthy();
    expect(within(dialog).getByText("UNREVIEWED")).toBeTruthy();
    expect(await within(dialog).findByText(/CVE-2026-1234/)).toBeTruthy();
    expect(within(dialog).getByText("Raw JSON")).toBeTruthy();
    const rawPre = within(dialog).getByText(/"creator": "CISA"/);
    expect(rawPre.textContent).toBe(JSON.stringify(detailPayload.raw, null, 2));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/feed-items/${ITEM_ID}/view`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("Details on a VIEWED row does not fire the view mutation again", async () => {
    // Given: the list shows a VIEWED item with a detail endpoint
    setToken("test-token");
    const detailPayload = { ...reviewedItem, raw: { title: "OpenSSL patch" } };
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url === `/api/feed-items/${reviewedItem.id}`,
        respond: () => new Response(JSON.stringify(detailPayload), { status: 200 }),
      },
      {
        match: (url, method) =>
          method === "GET" && url.startsWith("/api/feed-items"),
        respond: () => envelope([reviewedItem]),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // When: the analyst opens Details on the VIEWED row
    fireEvent.click(await screen.findByRole("button", { name: "Details" }));
    await screen.findByRole("dialog", { name: "Item details" });

    // Then: no POST /view is ever sent
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/view") && (init?.method ?? "GET") === "POST",
        ),
      ).toBe(false),
    );
  });
});
