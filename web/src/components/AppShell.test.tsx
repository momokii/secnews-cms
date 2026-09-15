import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/** Empty tickets-list response — every SHELL route mounts a list-backed page. */
function stubTicketListFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), {
        status: 200,
      }),
    ),
  );
}

function signInAsAdmin(): void {
  setToken("admin-token");
  setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "admin@example.com", name: "Admin", role: "ADMIN" });
}

describe("SHELL-01: role-aware navigation", () => {
  beforeEach(() => {
    localStorage.clear();
    stubTicketListFetch();
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
    stubTicketListFetch();
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
    stubTicketListFetch();
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

describe("TASK-UXB: collapsible sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    stubTicketListFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
  });

  function asideClasses(): string {
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const aside = nav.closest("aside");
    expect(aside).toBeTruthy();
    return aside?.className ?? "";
  }

  it("collapses to the icon rail, persists the choice, and expands again", () => {
    // Given: an authenticated session with the rail expanded
    signInAsAdmin();
    renderApp("/feeds/items");
    const toggle = screen.getByRole("button", { name: "Collapse navigation" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(asideClasses()).toContain("w-60");

    // When: the operator toggles the rail collapsed
    fireEvent.click(toggle);

    // Then: the rail narrows to the icon width, the flag flips, and the
    // collapsed state is persisted under secnews_nav_collapsed
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(asideClasses()).toContain("w-16");
    expect(localStorage.getItem("secnews_nav_collapsed")).toBe("1");

    // When: the operator expands the rail again
    fireEvent.click(screen.getByRole("button", { name: "Expand navigation" }));

    // Then: the wide rail and the stored flag are restored
    expect(screen.getByRole("button", { name: "Collapse navigation" }).getAttribute("aria-expanded")).toBe("true");
    expect(asideClasses()).toContain("w-60");
    expect(localStorage.getItem("secnews_nav_collapsed")).toBe("0");
  });

  it("restores the collapsed rail on the next mount from localStorage", () => {
    // Given: a previous session stored the collapsed choice
    signInAsAdmin();
    localStorage.setItem("secnews_nav_collapsed", "1");

    // When: the app renders fresh
    renderApp("/feeds/items");

    // Then: the rail starts collapsed with the toggle reflecting it
    const toggle = screen.getByRole("button", { name: "Expand navigation" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(asideClasses()).toContain("w-16");
  });

  it("hides nav label text while collapsed but keeps accessible link names", () => {
    // Given: an authenticated session
    signInAsAdmin();
    renderApp("/feeds/items");

    // When: the rail is collapsed
    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));

    // Then: the visible label span is hidden yet the link keeps its name
    const feeds = screen.getByRole("link", { name: "Feeds" });
    const label = Array.from(feeds.querySelectorAll("span")).find(
      (span) => span.textContent === "Feeds",
    );
    expect(label).toBeTruthy();
    expect(label?.className).toContain("hidden");
  });
});

describe("TASK-UIB: unified sidebar user block", () => {
  beforeEach(() => {
    localStorage.clear();
    stubTicketListFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
  });

  it("groups identity, Account, and Logout in one block above the nav", () => {
    // Given: an authenticated admin session with the rail expanded
    signInAsAdmin();
    renderApp("/feeds/items");

    // Then: a single user block holds the avatar initials, name, role badge,
    // Account link and Logout button — and it sits above the primary nav,
    // with no leftover footer divider
    const block = screen.getByRole("group", { name: "Signed-in user" });
    expect(within(block).getByText("Admin")).toBeTruthy();
    expect(within(block).getByText("ADMIN")).toBeTruthy();
    expect(within(block).getByText("AD")).toBeTruthy();
    expect(
      within(block).getByRole("link", { name: "Account" }).getAttribute("href"),
    ).toBe("/account");
    expect(within(block).getByRole("button", { name: "Logout" })).toBeTruthy();

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      block.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(block.className).not.toContain("border-t");
  });

  it("collapses to an avatar with a name tooltip while keeping Account and Logout", () => {
    // Given: an authenticated session
    signInAsAdmin();
    renderApp("/feeds/items");

    // When: the rail is collapsed
    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));

    // Then: the block shrinks to the avatar whose tooltip names the user,
    // while Account and Logout stay reachable
    const block = screen.getByRole("group", { name: "Signed-in user" });
    const avatar = within(block).getByText("AD");
    expect(avatar.getAttribute("title")).toContain("Admin");
    expect(within(block).queryByText("Admin")).toBeNull();
    expect(within(block).getByRole("link", { name: "Account" })).toBeTruthy();
    expect(within(block).getByRole("button", { name: "Logout" })).toBeTruthy();
  });

  it("renders no user block for guests", () => {
    // Given: no stored session
    clearToken();

    // When: the app renders at the login route
    renderApp("/login");

    // Then: the rail has no user block at all
    expect(screen.queryByRole("group", { name: "Signed-in user" })).toBeNull();
  });
});

describe("TASK-UIC2: session countdown", () => {
  beforeEach(() => {
    localStorage.clear();
    stubTicketListFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearToken();
  });

  /** Unsigned 3-segment JWT lookalike expiring at the given instant. */
  function tokenExpiringAt(expiresAtMs: number): string {
    const payload = btoa(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000) }));
    return `h.${payload}.sig`;
  }

  it("shows minutes left from the token exp", () => {
    // Given: an authenticated session whose token expires in 15 minutes
    setToken(tokenExpiringAt(Date.now() + 15 * 60_000));
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "admin@example.com", name: "Admin", role: "ADMIN" });

    // When: the app renders at a member route
    renderApp("/feeds/items");

    // Then: the user block shows the remaining session time
    const block = screen.getByRole("group", { name: "Signed-in user" });
    expect(within(block).getByText("Session 15m left")).toBeTruthy();
  });

  it("goes red under two minutes", () => {
    setToken(tokenExpiringAt(Date.now() + 60_000));
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "admin@example.com", name: "Admin", role: "ADMIN" });
    renderApp("/feeds/items");

    const oneMinute = screen.getByText("Session 1m left");
    expect(oneMinute.className).toContain("text-red-400");
  });

  it("reports an expired session once exp has passed", () => {
    setToken(tokenExpiringAt(Date.now() - 1_000));
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "admin@example.com", name: "Admin", role: "ADMIN" });
    renderApp("/feeds/items");

    expect(screen.getByText("Session expired")).toBeTruthy();
  });

  it("refreshes on the 30-second interval until it expires", () => {
    // Given: a token with 50 seconds left
    vi.useFakeTimers();
    setToken(tokenExpiringAt(Date.now() + 50_000));
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "admin@example.com", name: "Admin", role: "ADMIN" });
    renderApp("/feeds/items");
    expect(screen.getByText("Session 1m left")).toBeTruthy();

    // When: 30 seconds pass (20s left), then another 30 (expired)
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("Session 1m left")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // Then: the countdown updated without a remount
    expect(screen.getByText("Session expired")).toBeTruthy();
  });

  it("renders nothing for opaque (non-JWT) tokens", () => {
    // Given: a legacy opaque token with no decodable payload
    signInAsAdmin();

    // When: the app renders
    renderApp("/feeds/items");

    // Then: no countdown is rendered
    expect(screen.queryByText(/Session/)).toBeNull();
  });
});
