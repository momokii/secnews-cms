import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { clearToken, setToken, setUser } from "../lib/tokenStore";

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

describe("SHELL-01: role-aware navigation", () => {
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

  it("shows only Login and Bootstrap links when signed out", () => {
    // Given: no stored session
    clearToken();

    // When: the app renders at the login route
    renderApp("/login");

    // Then: the rail offers only the guest destinations
    expect(screen.getByRole("link", { name: "Login" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Bootstrap" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Feeds" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Tickets" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
  });

  it("shows member navigation, the role badge, and Logout for a signed-in admin", () => {
    // Given: an authenticated admin session
    setToken("admin-token");
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "admin@example.com", name: "Admin", role: "ADMIN" });

    // When: the app renders at a member route
    renderApp("/feeds/items");

    // Then: member destinations plus admin-only ones are present, guest ones are gone
    expect(screen.getByRole("link", { name: "Feeds" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Users" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Integrations" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Account" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Login" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Bootstrap" })).toBeNull();
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByText("ADMIN")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Logout" })).toBeTruthy();
  });

  it("hides Feeds-sources, Users and Integrations links for an analyst but keeps triage entries", () => {
    // Given: an authenticated analyst session
    setToken("analyst-token");
    setUser({ id: "6d0b8a2c-4e1f-47d3-95c7-8b9a0d1e2f3a", email: "analyst@example.com", name: "Analyst", role: "ANALYST" });

    // When: the app renders at a member route
    renderApp("/feeds/items");

    // Then: source-config and admin-only destinations are absent, triage ones remain
    expect(screen.queryByRole("link", { name: "Feeds" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Integrations" })).toBeNull();
    expect(screen.getByRole("link", { name: "Feed items" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tickets" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "OTX pulses" })).toBeTruthy();
  });
});

describe("SHELL-02: logout", () => {
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

  it("clears the session and navigates to /login", async () => {
    // Given: an authenticated admin session
    setToken("admin-token");
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "admin@example.com", name: "Admin", role: "ADMIN" });
    renderApp("/feeds/items");

    // When: the operator clicks Logout
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    // Then: the stored session is gone and the login page is shown
    await waitFor(() => expect(localStorage.getItem("secnews_token")).toBeNull());
    expect(await screen.findByRole("heading", { name: "Login" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Login" })).toBeTruthy();
  });
});

describe("SHELL-03: signed-in users skip guest routes", () => {
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

  it("redirects /login to /feeds when a session exists", async () => {
    // Given: an authenticated admin session
    setToken("admin-token");
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "admin@example.com", name: "Admin", role: "ADMIN" });

    // When: the app renders at /login
    renderApp("/login");

    // Then: the feeds page is shown instead
    expect(await screen.findByRole("heading", { name: "Feeds" })).toBeTruthy();
  });
});
