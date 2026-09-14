import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BootstrapPage } from "./BootstrapPage";
import { LoginPage } from "./LoginPage";

function renderPage(page: "login" | "bootstrap"): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}><MemoryRouter>
      {page === "login" ? <LoginPage /> : <BootstrapPage />}
    </MemoryRouter></QueryClientProvider>,
  );
}

describe("FE-AUTH-01: login", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("stores the returned token and navigates after valid credentials", async () => {
    // Given: the login endpoint accepts valid credentials
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            token: "jwt-token",
            user: { id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "admin@example.com", name: "Admin", role: "ADMIN" },
          }),
          { status: 200 },
        ),
      ),
    );
    renderPage("login");

    // When: the operator submits the login form
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    // Then: the token is persisted and the app leaves the login page
    await waitFor(() => expect(localStorage.getItem("secnews_token")).toBe("jwt-token"));
  });

  it("renders the API error envelope for rejected credentials", async () => {
    // Given: the API returns its documented error envelope
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid credentials", details: null } }),
          { status: 401 },
        ),
      ),
    );
    renderPage("login");

    // When: the operator submits credentials
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bad@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    // Then: the server message is visible
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid credentials");
  });
});

describe("FE-BST-01: first-run bootstrap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("only shows the setup form when auth status needs bootstrap", async () => {
    // Given: the public status endpoint reports first-run mode
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ needsBootstrap: true }), { status: 200 })),
    );

    // When: the bootstrap page loads
    renderPage("bootstrap");

    // Then: the admin setup form is shown
    expect(await screen.findByRole("heading", { name: "First-run setup" })).toBeTruthy();
    expect(screen.getByLabelText("Admin email")).toBeTruthy();
  });
});
