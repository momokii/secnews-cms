import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { setToken } from "./tokenStore";
import { feedItemsQueryKey, useFeedItems } from "./useFeeds";
import type { FeedItemsQuery } from "./feedsApi";

function createWrapper(): (props: { children: ReactNode }) => ReactNode {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const ITEM_ID = "5e9f8a7b-6c5d-4e3f-8a2b-1c0d9e8f7a6b";

const itemA = {
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

describe("FE-ITEM-01: feed item filters drive the queryKey and refetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("maps every filter into the queryKey so combinations cache independently", () => {
    // Given / When: query keys are derived from filter combinations
    // Then: status, q, and page each own a slot in the key
    expect(feedItemsQueryKey({ status: "UNREVIEWED" })).toEqual([
      "feed-items",
      "UNREVIEWED",
      null,
      1,
    ]);
    expect(
      feedItemsQueryKey({ status: "VIEWED", q: "openssl", page: 2 }),
    ).toEqual(["feed-items", "VIEWED", "openssl", 2]);
  });

  it("refetches with a new query string when status, q, or page change", async () => {
    // Given: a stored token and a stubbed list API
    setToken("test-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [itemA], total: 1, page: 1, pageSize: 20 }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When: the hook renders with one filter set and rerenders with another
    const initialFilters: { filters: FeedItemsQuery } = {
      filters: { status: "UNREVIEWED", page: 1 },
    };
    const { rerender, result } = renderHook(
      (props: { filters: FeedItemsQuery }) => useFeedItems(props.filters),
      { wrapper: createWrapper(), initialProps: initialFilters },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ filters: { status: "VIEWED", q: "openssl", page: 2 } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Then: each filter combination issues its own request shape
    const firstUrl = fetchMock.mock.calls[0][0] as string;
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(firstUrl).toBe("/api/feed-items?page=1&pageSize=20&status=UNREVIEWED");
    expect(secondUrl).toBe(
      "/api/feed-items?page=2&pageSize=20&status=VIEWED&q=openssl",
    );
  });

  it("keeps previous data visible via placeholderData while the next page loads", async () => {
    // Given: a first page answered immediately and a second page still in flight
    setToken("test-token");
    let resolveSecond: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [itemA],
            total: 40,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        ),
      )
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveSecond = resolve;
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    // When: the hook renders page 1 then switches to page 2
    const initialFilters: { filters: FeedItemsQuery } = {
      filters: { status: "UNREVIEWED", page: 1 },
    };
    const { rerender, result } = renderHook(
      (props: { filters: FeedItemsQuery }) => useFeedItems(props.filters),
      { wrapper: createWrapper(), initialProps: initialFilters },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ filters: { status: "UNREVIEWED", page: 2 } });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));

    // Then: page 1 rows stay on screen while page 2 fetches
    expect(result.current.data?.items.map((item) => item.id)).toEqual([ITEM_ID]);

    resolveSecond?.(
      new Response(
        JSON.stringify({ items: [], total: 40, page: 2, pageSize: 20 }),
        { status: 200 },
      ),
    );
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
  });
});
