import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setUnauthorizedNavigator, defaultUnauthorizedNavigator } from "../lib/api";
import { clearToken, getToken, setToken } from "../lib/tokenStore";
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
