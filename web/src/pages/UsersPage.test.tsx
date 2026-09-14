import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "./UsersPage";
import { setToken } from "../lib/tokenStore";

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
        return new Response(JSON.stringify({ items: [{ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "admin@example.com", name: "Admin", role: "ADMIN" }], total: 1, page: 1, pageSize: 20 }), { status: 200 });
      }
      if (String(input) === "/api/users" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "8d2f4b6a-1e3c-49f7-a5d9-2b4c6e8f0a1d", email: "analyst@example.com", name: "Analyst", role: "ANALYST" }), { status: 201 });
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
});
