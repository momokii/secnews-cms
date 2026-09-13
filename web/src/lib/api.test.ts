import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  defaultUnauthorizedNavigator,
  setUnauthorizedNavigator,
} from "./api";
import { clearToken, getToken, setToken } from "./tokenStore";

describe("FETCH-01: api token attach + 401 logout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedNavigator(defaultUnauthorizedNavigator);
  });

  it("attaches Bearer token from tokenStore and prefixes /api when token exists", async () => {
    // Given: a token stored in tokenStore
    setToken("test-token-123");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    // When: apiFetch requests a resource path
    await apiFetch("/feeds");

    // Then: fetch is called with the /api-prefixed URL and the Bearer header
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feeds");
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token-123");
  });

  it("omits Authorization header when no token is stored", async () => {
    // Given: no token in tokenStore
    clearToken();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    // When: apiFetch requests a resource path
    await apiFetch("/feeds");

    // Then: the request carries no Authorization header
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBeNull();
  });

  it("clears token, redirects to /login, and throws ApiError(401) on a 401 response", async () => {
    // Given: a stored token, an API that answers 401, and a captured navigator
    setToken("expired-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })),
    );
    const navigate = vi.fn();
    setUnauthorizedNavigator(navigate);

    // When: apiFetch is called
    const result = await apiFetch("/feeds").then(
      () => null,
      (error: unknown) => error,
    );

    // Then: the token is cleared, the app navigates to /login, and ApiError(401) is thrown
    expect(result).toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
    expect(navigate).toHaveBeenCalledWith("/login");
    if (result instanceof ApiError) {
      expect(result.status).toBe(401);
    }
  });

  it("throws ApiError with the response status for other non-2xx responses", async () => {
    // Given: an API that answers 500 and a captured navigator
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 })),
    );
    const navigate = vi.fn();
    setUnauthorizedNavigator(navigate);

    // When: apiFetch is called
    const result = await apiFetch("/feeds").then(
      () => null,
      (error: unknown) => error,
    );

    // Then: ApiError carries status 500 and no redirect happens
    expect(result).toBeInstanceOf(ApiError);
    expect(navigate).not.toHaveBeenCalled();
    if (result instanceof ApiError) {
      expect(result.status).toBe(500);
    }
  });
});
