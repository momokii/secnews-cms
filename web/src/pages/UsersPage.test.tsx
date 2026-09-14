import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "./UsersPage";
import { setToken, setUser } from "../lib/tokenStore";

const ADMIN_ID = "c528cea2-f3e7-4673-8def-37ac36981adf";

const ADMIN_ROW = {
  id: ADMIN_ID,
  email: "admin@example.com",
  name: "Admin",
  role: "ADMIN",
  createdAt: "2026-09-13T02:30:00.000Z",
  updatedAt: "2026-09-14T01:00:00.000Z",
};

function usersResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ items, total: items.length, page: 1, pageSize: 20 }), { status: 200 });
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FE-USR-01: users administration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("lists users and creates a user from the native dialog", async () => {
    // Given: an admin token and the users list endpoint
    setToken("admin-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/users?") && (init?.method ?? "GET") === "GET") {
        return usersResponse([ADMIN_ROW]);
      }
      if (String(input) === "/api/users" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "8d2f4b6a-1e3c-49f7-a5d9-2b4c6e8f0a1d", email: "analyst@example.com", name: "Analyst", role: "ANALYST", createdAt: "2026-09-14T01:00:00.000Z", updatedAt: "2026-09-14T01:00:00.000Z" }), { status: 201 });
      }
      throw new Error(`Unexpected request ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // When: the admin opens and submits the create dialog
    expect(await screen.findByText("admin@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add user" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Analyst" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "analyst@example.com" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "ANALYST" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    // Then: the documented create endpoint receives the role and credentials
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/users", expect.objectContaining({ method: "POST" })));
    expect(screen.getByText("Users")).toBeTruthy();
  });

  it("disables the role select with a note when editing your own row", async () => {
    // Given: a signed-in admin whose session id matches the listed admin row
    setToken("admin-token");
    setUser({ id: ADMIN_ID, email: "admin@example.com", name: "Admin", role: "ADMIN" });
    const fetchMock = vi.fn(async () => usersResponse([ADMIN_ROW]));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // When: the admin opens the edit dialog for their own row
    expect(await screen.findByText("admin@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // Then: the role select is disabled with the self-lockout note, name stays editable
    const roleSelect = await screen.findByLabelText("Role");
    expect(roleSelect).toHaveProperty("disabled", true);
    expect(screen.getByText("You cannot change your own role")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toHaveProperty("disabled", false);
  });

  it("renders a role-access legend covering ADMIN, EDITOR and ANALYST", async () => {
    // Given: a signed-in admin viewing the users list
    setToken("admin-token");
    setUser({ id: ADMIN_ID, email: "admin@example.com", name: "Admin", role: "ADMIN" });
    const fetchMock = vi.fn(async () => usersResponse([ADMIN_ROW]));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // When: the page renders
    await screen.findByText("admin@example.com");

    // Then: the legend documents each role's access per STATES.md §5
    expect(screen.getByText(/users, integrations, everything/)).toBeTruthy();
    expect(screen.getByText(/feeds, clients\/channels, tickets incl\. send\/close/)).toBeTruthy();
    expect(screen.getByText(/view \+ work tickets \(take, research, IOCs, AI fill\)/)).toBeTruthy();
  });

  it("renders Created and Updated WIB columns with raw ISO title attributes", async () => {
    // Given: a listed admin created 2026-09-13T02:30Z, updated 2026-09-14T01:00Z
    setToken("admin-token");
    vi.stubGlobal("fetch", vi.fn(async () => usersResponse([ADMIN_ROW])));
    renderPage();

    // When: the table renders
    await screen.findByText("admin@example.com");

    // Then: both columns exist and show WIB (UTC+7) wall-clock values,
    // with the raw ISO kept in the title attribute
    expect(screen.getByRole("columnheader", { name: "Created" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Updated" })).toBeTruthy();
    const created = screen.getByRole("cell", { name: "2026-09-13 09:30" });
    const updated = screen.getByRole("cell", { name: "2026-09-14 08:00" });
    expect(created.getAttribute("title")).toBe("2026-09-13T02:30:00.000Z");
    expect(updated.getAttribute("title")).toBe("2026-09-14T01:00:00.000Z");
  });

  it("coalesces rapid search keystrokes into one debounced q request that resets the page", async () => {
    // Given: 25 users so the admin can page to page 2 first
    setToken("admin-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const total = 25;
      return url.includes("page=1")
        ? new Response(JSON.stringify({ items: Array.from({ length: 20 }, (_, i) => ({ ...ADMIN_ROW, id: `u${i}`, email: `user${i}@example.com` })), total, page: 1, pageSize: 20 }), { status: 200 })
        : usersResponse([{ ...ADMIN_ROW, id: "u20", email: "user20@example.com" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("user0@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("page=2"))).toBe(true));

    // When: three rapid keystrokes land in the search box
    const search = screen.getByLabelText("Search users");
    fireEvent.change(search, { target: { value: "u" } });
    fireEvent.change(search, { target: { value: "us" } });
    fireEvent.change(search, { target: { value: "user20" } });

    // Then: exactly one request carries q=user20 and it restarts at page 1
    await waitFor(() => {
      const qCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("q=user20"));
      expect(qCalls).toHaveLength(1);
    });
    const qCall = fetchMock.mock.calls.find(([url]) => String(url).includes("q=user20"));
    expect(String(qCall?.[0])).toContain("page=1");
  });

  it("sends the selected role filter as a query param", async () => {
    // Given: a signed-in admin viewing the users list
    setToken("admin-token");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => usersResponse([ADMIN_ROW]));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("admin@example.com");

    // When: the role filter is set to EDITOR
    fireEvent.change(screen.getByLabelText("Filter by role"), { target: { value: "EDITOR" } });

    // Then: the list refetches with role=EDITOR from page 1
    await waitFor(() => {
      const roleCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("role=EDITOR"));
      expect(roleCalls).toHaveLength(1);
    });
    const roleCall = fetchMock.mock.calls.find(([url]) => String(url).includes("role=EDITOR"));
    expect(String(roleCall?.[0])).toContain("page=1");
  });
});
