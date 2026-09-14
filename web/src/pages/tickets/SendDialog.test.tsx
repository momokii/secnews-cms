import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { setToken } from "../../lib/tokenStore";
import {
  TICKET_ID,
  jsonResponse,
  renderWithProviders,
  routeFetch,
} from "./testUtils";
import { SendDialog } from "./SendDialog";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(
    { error: { code, message, details: null } },
    status,
  );
}

describe("FE-SND-01: send dialog", () => {
  it("sends {all:true} — active-only — when Send now is clicked", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "POST" && url === `/api/tickets/${TICKET_ID}/send`,
        respond: () =>
          jsonResponse({
            ticket: { id: TICKET_ID, status: "SENT" },
            audit: [],
          }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <SendDialog open onClose={vi.fn()} ticketId={TICKET_ID} onBlocked={vi.fn()} />,
    );

    const radio = screen.getByRole("radio", {
      name: /All active channels/,
    }) as HTMLInputElement;
    expect(radio.checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Send now" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/send`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ all: true }),
        }),
      ),
    );
  });

  it("raises the hard block and shows the 409 message when PENDING_SUGGESTIONS comes back", async () => {
    setToken("test-token");
    const onBlocked = vi.fn();
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "POST" && url === `/api/tickets/${TICKET_ID}/send`,
          respond: () =>
            errorResponse(409, "PENDING_SUGGESTIONS", "2 unresolved AI suggestion(s) block sending"),
        },
      ]),
    );
    renderWithProviders(
      <SendDialog open onClose={vi.fn()} ticketId={TICKET_ID} onBlocked={onBlocked} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send now" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    await waitFor(() => expect(onBlocked).toHaveBeenCalled());
    expect(screen.getByRole("alert").textContent).toContain("unresolved AI suggestion");
  });

  it("shows validation errors without raising the AI block on 422", async () => {
    setToken("test-token");
    const onBlocked = vi.fn();
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "POST" && url === `/api/tickets/${TICKET_ID}/send`,
          respond: () =>
            errorResponse(422, "VALIDATION", "Ticket is not READY"),
        },
      ]),
    );
    renderWithProviders(
      <SendDialog open onClose={vi.fn()} ticketId={TICKET_ID} onBlocked={onBlocked} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send now" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("propagates ApiError with the response status", () => {
    const error = new ApiError(409, "blocked");
    expect(error.status).toBe(409);
  });
});
