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
    await waitFor(() => {
      const page2Calls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/api/otx/pulses?page=2"),
      );
      expect(page2Calls).toHaveLength(1);
    });
    expect(screen.getByText("Emerald phishing") === null).toBe(false);
    expect(screen.queryByText(/Loading pulses/i)).toBeNull();

    page2Gate.resolve?.(envelope(2, [pulse(3, "Cobalt waltz")]));
    await screen.findByText("Cobalt waltz");
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
    expect(fetchMock).toHaveBeenCalledWith("/api/otx/pulses?page=1&source=subscribed", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("/api/otx/pulses?page=1&source=mine", expect.anything());
  });
});
