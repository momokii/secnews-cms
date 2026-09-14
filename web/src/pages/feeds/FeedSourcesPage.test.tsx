import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedSourcesPage } from "./FeedSourcesPage";
import { setToken } from "../../lib/tokenStore";

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <FeedSourcesPage />
    </QueryClientProvider>,
  );
}

describe("FEED-SRC explainer panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("explains ingestion above the table: poll cadence, extracted fields, dedupe, triage flow", async () => {
    // Given: the feed sources list API is available
    setToken("test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/feeds")) {
        return new Response(
          JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // When: the page renders
    renderPage();

    // Then: the explainer states the 15-minute FEED_POLL_CRON cadence, the
    // stored fields + raw payload, both dedupe rules, and the triage flow
    expect(
      await screen.findByRole("heading", { name: "How feed ingestion works" }),
    ).toBeTruthy();
    expect(screen.getByText(/FEED_POLL_CRON/)).toBeTruthy();
    expect(screen.getByText(/every 15 minutes/i)).toBeTruthy();
    expect(screen.getByText(/same link/i)).toBeTruthy();
    expect(screen.getByText(/same title/i)).toBeTruthy();
    expect(screen.getByText(/Unreviewed/)).toBeTruthy();
    expect(screen.getByText(/Viewed/)).toBeTruthy();
    expect(screen.getByText(/Taken/)).toBeTruthy();
  });
});
