import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFeed, deleteFeed, listFeeds, updateFeed } from "./feedsApi";
import { clearToken, setToken } from "./tokenStore";

const feedSource = {
  id: 1,
  name: "Krebs on Security",
  url: "https://krebsonsecurity.com/feed/",
  active: true,
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
};

describe("FE-FEED-01: feed source CRUD request shapes", () => {
  beforeEach(() => {
    localStorage.clear();
    setToken("test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
  });

  it("listFeeds issues GET /feeds with page params and parses the paginated envelope", async () => {
    // Given: the API answers with a paginated FeedSource envelope
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [feedSource], total: 1, page: 2, pageSize: 20 }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When: listFeeds requests page 2
    const result = await listFeeds({ page: 2 });

    // Then: the request is GET /api/feeds?page=2&pageSize=20 and the envelope is returned
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feeds?page=2&pageSize=20");
    expect(init.method).toBe("GET");
    expect(result).toEqual({
      items: [feedSource],
      total: 1,
      page: 2,
      pageSize: 20,
    });
  });

  it("createFeed POSTs the JSON body to /feeds and parses the created source", async () => {
    // Given: the API echoes the created feed source
    const body = {
      name: "CISA Advisories",
      url: "https://www.cisa.gov/cybersecurity-advisories/all.xml",
      active: true,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...feedSource, ...body, id: 9 }), {
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When: createFeed submits the new source
    const result = await createFeed(body);

    // Then: the request is POST /api/feeds with a JSON payload
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feeds");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(body));
    expect(result).toEqual({ ...feedSource, ...body, id: 9 });
  });

  it("updateFeed PATCHes only the provided fields to /feeds/:id", async () => {
    // Given: the API returns the updated source
    const patch = { active: false };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...feedSource, active: false }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When: updateFeed toggles active on feed 1
    const result = await updateFeed(1, patch);

    // Then: the request is PATCH /api/feeds/1 carrying exactly the patch
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feeds/1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify(patch));
    expect(result).toEqual({ ...feedSource, active: false });
  });

  it("deleteFeed issues DELETE /feeds/:id and resolves on the 204 empty body", async () => {
    // Given: the API answers 204 with no body
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    // When: deleteFeed removes feed 1
    await expect(deleteFeed(1)).resolves.toBeUndefined();

    // Then: the request is DELETE /api/feeds/1
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feeds/1");
    expect(init.method).toBe("DELETE");
  });
});
