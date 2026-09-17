import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "./App";
import { clearToken, setToken, setUser } from "./lib/tokenStore";

/** QueryClient + stubbed fetch so query-backed pages render in route tests. */
function renderApp(initialEntry: string): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ROUTE-01: unauthenticated redirect", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), {
          status: 200,
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
  });

  it("redirects /feeds to /login when no token is stored", () => {
    // Given: no token in tokenStore
    clearToken();

    // When: the app is rendered at /feeds
    renderApp("/feeds");

    // Then: the login stub is shown and the protected page is not
    expect(screen.getByRole("heading", { name: "Login" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Feeds" })).toBeNull();
  });

  it("renders the protected page when a token is stored", () => {
    // Given: a token in tokenStore
    setToken("valid-token");

    // When: the app is rendered at /feeds
    renderApp("/feeds");

    // Then: the feed sources page is shown inside the app shell
    expect(screen.getByRole("heading", { name: "Feeds" })).toBeTruthy();
  });

  it("hides admin navigation for an analyst session", () => {
    // Given: an authenticated analyst session
    setToken("analyst-token");
    setUser({ id: "6d0b8a2c-4e1f-47d3-95c7-8b9a0d1e2f3a", email: "analyst@example.com", name: "Analyst", role: "ANALYST" });

    // When: the app is rendered at the feed route
    renderApp("/feeds/items");

    // Then: admin-only destinations are absent from primary navigation
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Integrations" })).toBeNull();
  });
});

describe("ROUTE-02: analyst role access", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), {
          status: 200,
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
  });

  it("renders OTX pulses for an analyst instead of redirecting", () => {
    // Given: an authenticated analyst session
    setToken("analyst-token");
    setUser({ id: "6d0b8a2c-4e1f-47d3-95c7-8b9a0d1e2f3a", email: "analyst@example.com", name: "Analyst", role: "ANALYST" });

    // When: the app is rendered at /otx
    renderApp("/otx");

    // Then: the OTX pulses page is shown, not the gated feeds fallback
    expect(screen.getByRole("heading", { name: "OTX pulses" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Feeds" })).toBeNull();
  });

  it("lands RoleGate denial on /tickets instead of /feeds", () => {
    // Given: an authenticated analyst session hitting a manager-only route
    setToken("analyst-token");
    setUser({ id: "6d0b8a2c-4e1f-47d3-95c7-8b9a0d1e2f3a", email: "analyst@example.com", name: "Analyst", role: "ANALYST" });

    // When: the app is rendered at /feeds (sources, admin/editor only)
    renderApp("/feeds");

    // Then: the analyst is redirected to the tickets list
    expect(screen.getByRole("heading", { name: "Tickets" })).toBeTruthy();
  });

  it("lands / on /dashboard for an analyst", async () => {
    setToken("analyst-token");
    setUser({ id: "6d0b8a2c-4e1f-47d3-95c7-8b9a0d1e2f3a", email: "analyst@example.com", name: "Analyst", role: "ANALYST" });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/dashboard/")) {
        if (url.includes("/summary")) return new Response(JSON.stringify({ feedItems: { total: 0, byStatus: {} }, tickets: { total: 0, byStatus: {} }, deliveries: { sent: 0, failed: 0 } }), { status: 200 });
        return new Response(JSON.stringify({ buckets: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
    }));
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });
});
