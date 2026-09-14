import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import { OtxPulsesPage } from "./OtxPulsesPage";

function pulse(id: number, name: string) {
  return {
    id: String(id),
    name,
    isPublic: true,
    tlp: "GREEN",
    tags: ["phishing"],
    indicatorCount: 3,
    created: "2026-09-01T10:00:00.000Z",
    modified: "2026-09-02T10:00:00.000Z",
  };
}

function envelope(page: number, items: unknown[]): Response {
  return new Response(
    JSON.stringify({ items, total: 45, page, pageSize: 20 }),
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
        <OtxPulsesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FE-OTX-01: pulses list paginates with the page param", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("fetches /otx/pulses?page=N, renders the envelope, and keeps page 1 rows while page 2 loads", async () => {
    // Given: the pulses API serves page 1 now and holds page 2 in flight
    setToken("test-token");
    const page2Gate: { resolve: ((response: Response) => void) | null } = {
      resolve: null,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/otx/pulses") && url.includes("page=2")) {
        return new Promise<Response>((resolve) => {
          page2Gate.resolve = resolve;
        });
      }
      if (url.startsWith("/api/otx/pulses") && url.includes("page=1")) {
        return envelope(1, [pulse(1, "Emerald phishing"), pulse(2, "Ransom note")]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // When: the page renders and the operator advances to page 2
    renderPage();
    await screen.findByText("Emerald phishing");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // Then: page 2 is requested with the page param while page 1 stays shown
    await waitFor(
      () => {
        const page2Calls = fetchMock.mock.calls.filter(([url]) =>
          String(url).includes("/api/otx/pulses?page=2"),
        );
        expect(page2Calls).toHaveLength(1);
      },
      { timeout: 3000 },
    );
    expect(screen.getByText("Emerald phishing") === null).toBe(false);
    expect(screen.queryByText(/Loading pulses/i)).toBeNull();

    page2Gate.resolve?.(envelope(2, [pulse(3, "Cobalt waltz")]));
    await screen.findByText("Cobalt waltz", undefined, { timeout: 3000 });
    expect(screen.queryByText("Emerald phishing")).toBeNull();
  });

  it("requests My pulses when its tab is selected and returns to subscribed", async () => {
    // Given: both pulse sources are available
    setToken("test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("source=mine")) return envelope(1, [pulse(2, "My pulse")]);
      if (url.includes("source=subscribed")) return envelope(1, [pulse(1, "Subscribed pulse")]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // When: the operator switches to My pulses, then back to Subscribed
    renderPage();
    await screen.findByText("Subscribed pulse");
    fireEvent.click(screen.getByRole("tab", { name: "My pulses" }));
    await screen.findByText("My pulse");
    fireEvent.click(screen.getByRole("tab", { name: "Subscribed" }));

    // Then: each tab requests its explicit source and the original rows return
    await screen.findByText("Subscribed pulse");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/otx/pulses?page=1&source=subscribed&pageSize=20",
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/otx/pulses?page=1&source=mine&pageSize=20",
      expect.anything(),
    );
  });
});

describe("FE-OTX-02: page size and search controls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("refetches with the selected page size and returns to page 1", async () => {
    // Given: the subscribed feed answers every page with rows
    setToken("test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/otx/pulses") && url.includes("page=2")) {
        return envelope(2, [pulse(3, "Cobalt waltz")]);
      }
      if (url.startsWith("/api/otx/pulses")) {
        return envelope(1, [pulse(1, "Emerald phishing")]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("Emerald phishing");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // When: the operator picks 50 per page
    fireEvent.change(await screen.findByLabelText("Items per page"), {
      target: { value: "50" },
    });

    // Then: the next request carries pageSize=50 back on page 1
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url) === "/api/otx/pulses?page=1&source=subscribed&pageSize=50",
        ),
      ).toBe(true);
    });
  });

  it("coalesces rapid keystrokes on the Search tab into one debounced q request", async () => {
    // Given: the search source serves an empty result for any query
    setToken("test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("source=search")) return envelope(1, []);
      if (url.includes("source=subscribed")) return envelope(1, [pulse(1, "Emerald phishing")]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("Emerald phishing");

    // When: the operator opens Search and types in quick succession
    fireEvent.click(screen.getByRole("tab", { name: "Search" }));
    const search = await screen.findByLabelText("Search pulses");
    fireEvent.change(search, { target: { value: "r" } });
    fireEvent.change(search, { target: { value: "ra" } });
    fireEvent.change(search, { target: { value: "ransomware" } });

    // Then: exactly one search request carries q and it carries the final
    // value — the only other search call is the bare tab-open fetch
    await waitFor(
      () => {
        const qCalls = fetchMock.mock.calls.filter(([url]) =>
          String(url).includes("q=ransomware"),
        );
        expect(qCalls).toHaveLength(1);
        expect(String(qCalls[0]?.[0])).toBe(
          "/api/otx/pulses?page=1&source=search&pageSize=20&q=ransomware",
        );
      },
      { timeout: 3000 },
    );
    const qBearingCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("q="),
    );
    expect(qBearingCalls).toHaveLength(1);
  });
});

describe("TASK-OTXFIX author, unified search box, and OTX link", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("renders the Author column with the pulse author and an em-dash when absent", async () => {
    // Given: a subscribed envelope with one authored pulse and one without an author
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/otx/pulses")) {
          return envelope(1, [
            { ...pulse(1, "Emerald phishing"), authorName: "SampleUser" },
            { ...pulse(2, "Ransom note"), authorName: "" },
          ]);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    // When: the page renders
    renderPage();
    await screen.findByText("Emerald phishing");

    // Then: the author shows in its column and the missing author is an em-dash
    expect(screen.getByRole("columnheader", { name: "Author" })).toBeTruthy();
    expect(screen.getByText("SampleUser")).toBeTruthy();
    const row = screen.getByText("Ransom note").closest("tr");
    expect(row?.textContent).toContain("—");
  });

  it("switches the listing to source=search while typing from any tab and restores the tab on clear", async () => {
    // Given: both the subscribed feed and the search source answer
    setToken("test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("source=search")) return envelope(1, [pulse(9, "Search hit")]);
      if (url.includes("source=subscribed")) return envelope(1, [pulse(1, "Subscribed pulse")]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("Subscribed pulse");

    // When: the operator types into the single search box above the tabs
    const search = await screen.findByLabelText("Search pulses");
    fireEvent.change(search, { target: { value: "ransomware" } });
    await screen.findByText("Search hit");

    // Then: the listing fetched the server-side search source with q
    expect(
      fetchMock.mock.calls.some(
        ([url]) =>
          String(url) === "/api/otx/pulses?page=1&source=search&pageSize=20&q=ransomware",
      ),
    ).toBe(true);

    // When: the operator clears the search box
    fireEvent.change(search, { target: { value: "" } });

    // Then: the listing restores the active (subscribed) tab
    await waitFor(
      () => {
        const calls = fetchMock.mock.calls.map(([url]) => String(url));
        const searchIndex = calls.findIndex((url) => url.includes("q=ransomware"));
        const restoreIndex = calls.findIndex(
          (url, index) =>
            index > searchIndex &&
            url === "/api/otx/pulses?page=1&source=subscribed&pageSize=20",
        );
        expect(searchIndex).toBeGreaterThanOrEqual(0);
        expect(restoreIndex).toBeGreaterThan(searchIndex);
      },
      { timeout: 3000 },
    );
  });

  it("shows the Author row and a View on OTX link pointing at the pulse in the detail modal", async () => {
    // Given: a list row and its detail carrying an author
    setToken("test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/otx/pulses/1") {
        return new Response(
          JSON.stringify({
            id: "1",
            name: "Emerald phishing",
            description: "Phishing kit narrative.",
            authorName: "SampleUser",
            isPublic: true,
            tlp: "GREEN",
            tags: [],
            references: [],
            indicators: [],
            created: "2026-09-01T10:00:00.000Z",
            modified: "2026-09-02T10:00:00.000Z",
          }),
          { status: 200 },
        );
      }
      if (url.startsWith("/api/otx/pulses")) {
        return envelope(1, [pulse(1, "Emerald phishing")]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // When: the operator opens the row's Details
    renderPage();
    await screen.findByText("Emerald phishing");
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    await screen.findByText("Phishing kit narrative.");

    // Then: the author renders and the OTX link targets the pulse page
    expect(screen.getByText("SampleUser")).toBeTruthy();
    const link = screen.getByRole("link", { name: "View on OTX" });
    expect(link.getAttribute("href")).toBe("https://otx.alienvault.com/pulse/1");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});

describe("FE-OTX-03: pulse details modal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("loads /otx/pulses/:id through the proxy and renders the full detail", async () => {
    // Given: the list and a private pulse detail behind the proxy
    setToken("test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/otx/pulses/1") {
        return new Response(
          JSON.stringify({
            id: "1",
            name: "Emerald phishing",
            description: "Phishing kit narrative.",
            isPublic: false,
            tlp: "AMBER",
            tags: ["phishing", "kit"],
            references: ["https://example.com/advisory"],
            indicators: [
              { value: "evil.com", type: "domain" },
              { value: "1.2.3.4", type: "IPv4" },
            ],
            created: "2026-09-01T10:00:00.000Z",
            modified: "2026-09-02T10:00:00.000Z",
          }),
          { status: 200 },
        );
      }
      if (url.startsWith("/api/otx/pulses")) {
        return envelope(1, [pulse(1, "Emerald phishing")]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // When: the operator opens the row's Details
    renderPage();
    await screen.findByText("Emerald phishing");
    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    // Then: the modal shows description, TLP, visibility note, tags,
    // references, grouped indicators, and WIB dates
    await screen.findByText("Phishing kit narrative.");
    expect(screen.getByText("Private pulse — visible because the configured OTX key can access it.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "https://example.com/advisory" }).getAttribute("href")).toBe(
      "https://example.com/advisory",
    );
    expect(screen.getByText("evil.com")).toBeTruthy();
    expect(screen.getByText("1.2.3.4")).toBeTruthy();
    expect(screen.getAllByText("domain").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-09-02 17:00 WIB").length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/otx/pulses/1")).toBe(true);
  });
});

describe("TASK-UXB: loading, empty, and error states", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("shows skeleton rows while the first page is pending instead of dead text", async () => {
    // Given: the pulses endpoint holds its response in flight
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Promise<Response>(() => {})),
    );

    // When: the page renders
    renderPage();

    // Then: a labelled loading status with skeleton rows shows and no table yet
    expect(screen.getByRole("status", { name: "Loading pulses" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a Searching… status while a search request is in flight and clears it on results", async () => {
    // Given: the search source never answers until the test releases it
    setToken("test-token");
    const searchGate: { resolve: ((response: Response) => void) | null } = {
      resolve: null,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("source=search")) {
        return new Promise<Response>((resolve) => {
          searchGate.resolve = resolve;
        });
      }
      if (url.includes("source=subscribed")) return envelope(1, [pulse(1, "Subscribed pulse")]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("Subscribed pulse");

    // When: the operator runs a keyword search
    fireEvent.click(screen.getByRole("tab", { name: "Search" }));
    const search = await screen.findByLabelText("Search pulses");
    fireEvent.change(search, { target: { value: "ransomware" } });

    // Then: a Searching… status shows while the request is in flight…
    expect(await screen.findByText("Searching…")).toBeTruthy();

    // …and disappears once the results land
    searchGate.resolve?.(envelope(1, [pulse(9, "Search hit")]));
    await screen.findByText("Search hit");
    expect(screen.queryByText("Searching…")).toBeNull();
  });

  it("shows 'No pulses found' when the source returns zero rows", async () => {
    // Given: the subscribed feed answers with an empty envelope
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/otx/pulses")) return envelope(1, []);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    // When: the page renders
    renderPage();

    // Then: the proper empty state is shown, not a loading or error state
    expect(await screen.findByText(/No pulses found/)).toBeTruthy();
  });

  it("shows an error alert with a working Retry button when the query fails", async () => {
    // Given: the pulses endpoint answers 502 first, then recovers
    setToken("test-token");
    let failing = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (failing) {
          return new Response(
            JSON.stringify({ error: { code: "UPSTREAM", message: "OTX upstream unavailable", details: null } }),
            { status: 502 },
          );
        }
        return envelope(1, [pulse(1, "Emerald phishing")]);
      }),
    );

    // When: the page renders and the operator clicks Retry after recovery
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("OTX upstream unavailable");
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    // Then: the rows load and the alert is gone
    await screen.findByText("Emerald phishing");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
