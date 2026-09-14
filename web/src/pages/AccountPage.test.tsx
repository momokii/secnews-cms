import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setUnauthorizedNavigator, defaultUnauthorizedNavigator } from "../lib/api";
import { clearToken, getToken, getUser, setToken, setUser } from "../lib/tokenStore";
import { AccountPage } from "./AccountPage";

describe("FE-ACCT-01: change password", () => {
  afterEach(() => {
    setUnauthorizedNavigator(defaultUnauthorizedNavigator);
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("POSTs the form to /auth/change-password and confirms the update", async () => {
    // Given: the endpoint accepts the rotation with 204 and a signed-in session
    setToken("session-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    // When: the operator submits current + new password
    render(<AccountPage />);
    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "old-password-1" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    // Then: the request hits /api/auth/change-password with the JSON body and success is shown
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Password updated"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/change-password");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      currentPassword: "old-password-1",
      newPassword: "new-password-1",
    });
  });

  it("renders the API error and keeps the session when the current password is wrong", async () => {
    // Given: the endpoint rejects a wrong current password with 401 (not a session expiry)
    setToken("session-token");
    setUnauthorizedNavigator(() => {
      throw new Error("must not navigate on a wrong current password");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "UNAUTHORIZED", message: "Current password is incorrect", details: null },
          }),
          { status: 401 },
        ),
      ),
    );

    // When: the operator submits a wrong current password
    render(<AccountPage />);
    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "wrong-current" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    // Then: the server message is visible and the session token survives
    expect((await screen.findByRole("alert")).textContent).toContain("Current password is incorrect");
    expect(getToken()).toBe("session-token");
    clearToken();
  });
});

describe("FE-ACCT-02: profile info", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("renders the signed-in profile fields above the password form", () => {
    // Given: a signed-in session with profile data
    setToken("session-token");
    setUser({
      id: "c528cea2-f3e7-4673-8def-37ac36981adf",
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN",
    });

    // When: the account page renders
    render(<AccountPage />);

    // Then: name, email, role, and user id are visible and the form remains
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByText("admin@example.com")).toBeTruthy();
    expect(screen.getByText("ADMIN")).toBeTruthy();
    expect(screen.getByText("c528cea2-f3e7-4673-8def-37ac36981adf")).toBeTruthy();
    expect(screen.getByLabelText("Current password")).toBeTruthy();
    expect(screen.getByLabelText("New password")).toBeTruthy();
  });

  it("edits name and email with a self PATCH and refreshes the session user", async () => {
    // Given: a signed-in session and the updated profile response
    setToken("session-token");
    setUser({
      id: "c528cea2-f3e7-4673-8def-37ac36981adf",
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "c528cea2-f3e7-4673-8def-37ac36981adf",
          email: "updated@example.com",
          name: "Updated Admin",
          role: "ADMIN",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When: the operator edits and saves their profile
    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Updated Admin" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "updated@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    // Then: only name and email are sent to the current user's endpoint
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Profile updated"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/users/c528cea2-f3e7-4673-8def-37ac36981adf");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Updated Admin", email: "updated@example.com" });
    expect(getUser()).toEqual({
      id: "c528cea2-f3e7-4673-8def-37ac36981adf",
      email: "updated@example.com",
      name: "Updated Admin",
      role: "ADMIN",
    });
  });

  it("gives the password form its own section heading", () => {
    // Given: a signed-in session
    setToken("session-token");

    // When: the account page renders
    render(<AccountPage />);

    // Then: password management has a semantic heading
    expect(screen.getByRole("heading", { name: "Change password", level: 2 })).toBeTruthy();
  });
});
