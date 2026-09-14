import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { setToken } from "../../lib/tokenStore";
import type { Channel, Client } from "../../lib/clientsApi";
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

const CLIENTS: Client[] = [
  { id: "c1c1c1c1-1111-4111-8111-111111111111", name: "Acme SOC", active: true, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
  { id: "c2c2c2c2-2222-4222-8222-222222222222", name: "Beta NOC", active: true, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
];

function channelFixture(overrides: Partial<Channel> & { type: Channel["type"] }): Channel {
  const base = {
    id: overrides.id ?? "d1d1d1d1-3333-4333-8333-333333333333",
    clientId: overrides.clientId ?? CLIENTS[0].id,
    active: overrides.active ?? true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  if (overrides.type === "WHATSAPP") {
    return { ...base, type: "WHATSAPP", chatId: overrides.chatId ?? "wa:62812" };
  }
  if (overrides.type === "TELEGRAM") {
    return {
      ...base,
      type: "TELEGRAM",
      chatId: overrides.chatId ?? "chat:-100200",
      tokenMasked: "123456:AA…x9Z",
      hasToken: true,
    };
  }
  return { ...base, type: "EMAIL", bcc: overrides.bcc ?? ["soc@corp.io"] };
}

const CHANNELS_BY_CLIENT: Record<string, Channel[]> = {
  [CLIENTS[0].id]: [
    channelFixture({ type: "TELEGRAM", id: "e1e1e1e1-4444-4444-8444-444444444441", active: true }),
    channelFixture({ type: "WHATSAPP", id: "e2e2e2e2-4444-4444-8444-444444444442", active: false }),
  ],
  [CLIENTS[1].id]: [
    channelFixture({ type: "EMAIL", id: "e3e3e3e3-4444-4444-8444-444444444443", clientId: CLIENTS[1].id, active: true }),
  ],
};

/** Client + per-client channel stubs backing the picker. */
function channelRoutes(): Parameters<typeof routeFetch>[0] {
  let clientId = "";
  return [
    {
      match: (url, method) => method === "GET" && url.startsWith("/api/clients?"),
      respond: () => jsonResponse({ items: CLIENTS, total: CLIENTS.length, page: 1, pageSize: 100 }),
    },
    {
      match: (url, method) => {
        if (method !== "GET" || !/^\/api\/clients\/[^/]+\/channels$/.test(url)) return false;
        clientId = url.split("/")[3];
        return true;
      },
      respond: () => jsonResponse(CHANNELS_BY_CLIENT[clientId] ?? []),
    },
  ];
}

describe("FE-SND-01: send dialog", () => {
  it("sends {all:true} — active-only — when Send now is clicked", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([
      ...channelRoutes(),
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

  it("cherry-picks a channel and sends {channelIds:[id]} in select mode", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([
      ...channelRoutes(),
      {
        match: (url, method) =>
          method === "POST" && url === `/api/tickets/${TICKET_ID}/send`,
        respond: () => jsonResponse({ ticket: { id: TICKET_ID, status: "SENT" }, audit: [] }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <SendDialog open onClose={vi.fn()} ticketId={TICKET_ID} onBlocked={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Select channels/ }));

    expect((await screen.findAllByText("Acme SOC")).length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Acme SOC TELEGRAM/ }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Send now" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/send`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            channelIds: ["e1e1e1e1-4444-4444-8444-444444444441"],
          }),
        }),
      ),
    );
  });

  it("disables inactive channels with a reason and blocks sending with none selected", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        ...channelRoutes(),
        {
          match: (url, method) =>
            method === "POST" && url === `/api/tickets/${TICKET_ID}/send`,
          respond: () => jsonResponse({ ticket: { id: TICKET_ID, status: "SENT" }, audit: [] }),
        },
      ]),
    );
    renderWithProviders(
      <SendDialog open onClose={vi.fn()} ticketId={TICKET_ID} onBlocked={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Select channels/ }));

    const inactive = (await screen.findByRole("checkbox", {
      name: /Acme SOC WHATSAPP/,
    })) as HTMLInputElement;
    expect(inactive.disabled).toBe(true);
    expect(screen.getByText(/Inactive — excluded from sending/)).toBeTruthy();

    const send = screen.getByRole("button", { name: "Send now" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it("surfaces the 409 INACTIVE_TARGET message in the dialog without the AI block", async () => {
    setToken("test-token");
    const onBlocked = vi.fn();
    vi.stubGlobal(
      "fetch",
      routeFetch([
        ...channelRoutes(),
        {
          match: (url, method) =>
            method === "POST" && url === `/api/tickets/${TICKET_ID}/send`,
          respond: () =>
            errorResponse(409, "INACTIVE_TARGET", "1 selected channel is inactive"),
        },
      ]),
    );
    renderWithProviders(
      <SendDialog open onClose={vi.fn()} ticketId={TICKET_ID} onBlocked={onBlocked} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Select channels/ }));
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /Acme SOC TELEGRAM/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send now" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("inactive");
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("raises the hard block and shows the 409 message when PENDING_SUGGESTIONS comes back", async () => {
    setToken("test-token");
    const onBlocked = vi.fn();
    vi.stubGlobal(
      "fetch",
      routeFetch([
        ...channelRoutes(),
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
        ...channelRoutes(),
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
