import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientsPage } from "./ClientsPage";
import { setToken } from "../lib/tokenStore";
import type { Channel, Client } from "../lib/clientsApi";

const acme: Client = {
  id: "b3c9d1e0-77aa-4c01-9d02-3a5b7c9d0001",
  name: "Acme Corp",
  active: true,
  createdAt: "2026-09-01T09:00:00.000Z",
  updatedAt: "2026-09-01T09:00:00.000Z",
};

const TELEGRAM_CHANNEL_ID = "a9b8c7d6-5e4f-4321-8765-ba0987654321";
const WHATSAPP_CHANNEL_ID = "1a2b3c4d-5e6f-4789-9abc-def012345678";
const EMAIL_CHANNEL_ID = "0f1e2d3c-4b5a-4678-9abc-def012345679";

const CHANNELS_LIST_URL = `/api/clients/${acme.id}/channels`;

function telegramChannel(
  overrides: Partial<Extract<Channel, { type: "TELEGRAM" }>> = {},
): Channel {
  return {
    type: "TELEGRAM",
    id: TELEGRAM_CHANNEL_ID,
    clientId: acme.id,
    chatId: "@secops",
    tokenMasked: "111222:AA…x9Z",
    hasToken: true,
    active: true,
    createdAt: "2026-09-14T08:00:00.000Z",
    updatedAt: "2026-09-14T08:00:00.000Z",
    ...overrides,
  };
}

function whatsappChannel(chatId: string): Channel {
  return {
    type: "WHATSAPP",
    id: WHATSAPP_CHANNEL_ID,
    clientId: acme.id,
    chatId,
    active: true,
    createdAt: "2026-09-14T08:00:00.000Z",
    updatedAt: "2026-09-14T08:00:00.000Z",
  };
}

function emailChannel(bcc: string[]): Channel {
  return {
    type: "EMAIL",
    id: EMAIL_CHANNEL_ID,
    clientId: acme.id,
    bcc,
    active: true,
    createdAt: "2026-09-14T08:00:00.000Z",
    updatedAt: "2026-09-14T08:00:00.000Z",
  };
}

interface RecordedCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

/**
 * Fetch stub with the routeFetch shape used by the other page tests, plus a
 * `calls` log of every request (GET included) so tests can assert the panel
 * reads the server list instead of echoing mutation responses.
 */
function stubFetch(
  routes: Array<{
    match: (url: string, method: string) => boolean;
    respond: (init?: RequestInit) => Response;
  }>,
  calls: RecordedCall[],
): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body:
        method !== "GET" && init?.body !== undefined
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : null,
    });
    const route = routes.find((candidate) => candidate.match(url, method));
    if (route === undefined) {
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }
    return route.respond(init);
  });
}

function clientsRoute(): {
  match: (url: string, method: string) => boolean;
  respond: () => Response;
} {
  return {
    match: (url, method) => method === "GET" && url.startsWith("/api/clients?"),
    respond: () =>
      new Response(
        JSON.stringify({ items: [acme], total: 1, page: 1, pageSize: 20 }),
        { status: 200 },
      ),
  };
}

/** GET /clients/:clientId/channels — serves the mutable "server" state. */
function channelsListRoute(channels: Channel[]): {
  match: (url: string, method: string) => boolean;
  respond: () => Response;
} {
  return {
    match: (url, method) => method === "GET" && url === CHANNELS_LIST_URL,
    respond: () =>
      new Response(JSON.stringify(channels), { status: 200 }),
  };
}

/** POST /clients/:clientId/channels — persists then answers 201 (real server). */
function createChannelRoute(channels: Channel[]): {
  match: (url: string, method: string) => boolean;
  respond: (init?: RequestInit) => Response;
} {
  return {
    match: (url, method) => method === "POST" && url === CHANNELS_LIST_URL,
    respond: (init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const channel =
        body.type === "TELEGRAM"
          ? telegramChannel({ chatId: String(body.chatId) })
          : body.type === "WHATSAPP"
            ? whatsappChannel(String(body.chatId))
            : emailChannel(body.bcc as string[]);
      channels.push(channel);
      return new Response(JSON.stringify(channel), { status: 201 });
    },
  };
}

/** POST /clients/:clientId/channels/:id/test — Telegram send probe (#46b). */
function testChannelRoute(result: Record<string, unknown>): {
  match: (url: string, method: string) => boolean;
  respond: (init?: RequestInit) => Response;
} {
  return {
    match: (url, method) =>
      method === "POST" &&
      url === `/api/clients/${acme.id}/channels/${TELEGRAM_CHANNEL_ID}/test`,
    respond: () =>
      new Response(JSON.stringify(result), { status: 200 }),
  };
}

/** PATCH /channels/:id — applies {active} to the "server" state. */
function toggleChannelRoute(channels: Channel[], id: string, active: boolean): {
  match: (url: string, method: string) => boolean;
  respond: () => Response;
} {
  return {
    match: (url, method) => method === "PATCH" && url === `/api/channels/${id}`,
    respond: () => {
      const updated = channels.map((channel) =>
        channel.id === id ? ({ ...channel, active } as Channel) : channel,
      );
      channels.splice(0, channels.length, ...updated);
      const row = updated.find((channel) => channel.id === id);
      return new Response(JSON.stringify(row ?? null), { status: 200 });
    },
  };
}

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClientsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openChannelsPanel(): Promise<HTMLElement> {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Channels" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("button", { name: "Add channel" });
  return dialog;
}

function listGetCount(calls: RecordedCall[]): number {
  return calls.filter((c) => c.method === "GET" && c.url === CHANNELS_LIST_URL)
    .length;
}

describe("FE-CHN-LIST: the panel lists channels from the server, surviving reopen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("fetches GET /clients/:id/channels on open and shows persisted rows after reopen", async () => {
    // Given: Acme has one Telegram channel created in a previous session
    setToken("test-token");
    const persisted: Channel[] = [telegramChannel()];
    const calls: RecordedCall[] = [];
    vi.stubGlobal(
      "fetch",
      stubFetch([clientsRoute(), channelsListRoute(persisted)], calls),
    );

    // When: the channels popup opens
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Channels" }));
    const dialog = await screen.findByRole("dialog");

    // Then: the panel fetched the server list and renders the persisted row
    await waitFor(() => expect(listGetCount(calls)).toBe(1));
    expect(await within(dialog).findByText(/@secops/)).not.toBeNull();
    expect(within(dialog).getByText(/111222:AA…x9Z/)).not.toBeNull();

    // When: the popup is closed and reopened
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(await screen.findByRole("button", { name: "Channels" }));
    const reopened = await screen.findByRole("dialog");

    // Then: the server list is fetched again and the channel is still there
    await waitFor(() => expect(listGetCount(calls)).toBe(2));
    expect(await within(reopened).findByText(/@secops/)).not.toBeNull();
  });
});

describe("FE-CHN-01: channel create sends the per-type discriminated body", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("creates WHATSAPP, TELEGRAM, and EMAIL channels with contract-exact shapes", async () => {
    // Given: Acme Corp exists and its channels panel is open and empty
    setToken("test-token");
    const persisted: Channel[] = [];
    const calls: RecordedCall[] = [];
    vi.stubGlobal(
      "fetch",
      stubFetch(
        [
          clientsRoute(),
          channelsListRoute(persisted),
          createChannelRoute(persisted),
        ],
        calls,
      ),
    );
    const dialog = await openChannelsPanel();

    // When: a WHATSAPP channel is added with only a chat id
    fireEvent.change(within(dialog).getByLabelText("Type"), {
      target: { value: "WHATSAPP" },
    });
    fireEvent.change(within(dialog).getByLabelText("Chat ID"), {
      target: { value: "12025550123" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add channel" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));

    // When: a TELEGRAM channel is added with chat id + bot token
    fireEvent.change(within(dialog).getByLabelText("Type"), {
      target: { value: "TELEGRAM" },
    });
    fireEvent.change(within(dialog).getByLabelText("Chat ID"), {
      target: { value: "@secops" },
    });
    fireEvent.change(within(dialog).getByLabelText("Bot token"), {
      target: { value: "111222:AAE-rawtoken" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add channel" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(2));

    // When: an EMAIL channel is added with a comma-separated bcc list
    fireEvent.change(within(dialog).getByLabelText("Type"), {
      target: { value: "EMAIL" },
    });
    fireEvent.change(within(dialog).getByLabelText("BCC addresses"), {
      target: { value: "a@corp.io, b@corp.io" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add channel" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(3));

    // Then: each create body is exactly the discriminated contract shape (#44)
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts[0].url).toBe(CHANNELS_LIST_URL);
    expect(posts[0].body).toEqual({ type: "WHATSAPP", chatId: "12025550123" });
    expect(posts[1].body).toEqual({
      type: "TELEGRAM",
      chatId: "@secops",
      token: "111222:AAE-rawtoken",
    });
    expect(posts[2].body).toEqual({
      type: "EMAIL",
      bcc: ["a@corp.io", "b@corp.io"],
    });

    // And: every add refetched the server list — rows come from the refetch,
    // not from a local echo of the create responses
    await waitFor(() => expect(listGetCount(calls)).toBe(4));
    expect(await within(dialog).findByText("12025550123")).not.toBeNull();
    expect(within(dialog).getByText(/111222:AA…x9Z/)).not.toBeNull();
    expect(within(dialog).getByText(/a@corp.io/)).not.toBeNull();
    expect(document.body.textContent).not.toContain("AAE-rawtoken");
  });
});

describe("FE-CHN-02: channel active toggle PATCHes only {active}", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("flips a channel to inactive via PATCH /channels/:id and renders the new state", async () => {
    // Given: Acme's panel is open with no channels yet
    setToken("test-token");
    const persisted: Channel[] = [];
    const calls: RecordedCall[] = [];
    vi.stubGlobal(
      "fetch",
      stubFetch(
        [
          clientsRoute(),
          channelsListRoute(persisted),
          createChannelRoute(persisted),
          toggleChannelRoute(persisted, TELEGRAM_CHANNEL_ID, false),
        ],
        calls,
      ),
    );
    const dialog = await openChannelsPanel();

    // Seed one channel through the editor (persisted server-side by the stub)
    fireEvent.change(within(dialog).getByLabelText("Type"), {
      target: { value: "TELEGRAM" },
    });
    fireEvent.change(within(dialog).getByLabelText("Chat ID"), {
      target: { value: "@secops" },
    });
    fireEvent.change(within(dialog).getByLabelText("Bot token"), {
      target: { value: "111222:AAE-rawtoken" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add channel" }));
    const chatIdCell = await within(dialog).findByText(/@secops/);

    // When: the admin unticks the channel's Active checkbox
    const row = chatIdCell.closest("tr");
    expect(row).not.toBeNull();
    const checkbox = row?.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox as Element);

    // Then: the channel PATCH carries exactly {active:false} — no token echo
    await waitFor(() => {
      const patches = calls.filter((c) => c.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(patches[0].url).toBe(`/api/channels/${TELEGRAM_CHANNEL_ID}`);
    });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ active: false });
    expect(JSON.stringify(patch?.body)).not.toContain("token");

    // And: the row reflects the server state via the post-toggle refetch
    await waitFor(() => expect(listGetCount(calls)).toBe(3));
    expect(await within(dialog).findByText("Inactive")).not.toBeNull();
  });
});

describe("FE-CHN-TEST: telegram channel test connection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("POSTs /clients/:clientId/channels/:id/test and surfaces a green OK", async () => {
    // Given: Acme's panel is open with one existing Telegram channel
    setToken("test-token");
    const persisted: Channel[] = [telegramChannel()];
    const calls: RecordedCall[] = [];
    vi.stubGlobal(
      "fetch",
      stubFetch(
        [
          clientsRoute(),
          channelsListRoute(persisted),
          testChannelRoute({ ok: true, latencyMs: 340 }),
        ],
        calls,
      ),
    );
    const dialog = await openChannelsPanel();
    const row = (await within(dialog).findByText(/@secops/)).closest("tr");
    expect(row).not.toBeNull();

    // When: the admin clicks the row's Test connection button
    fireEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "Test connection" }),
    );

    // Then: the POST hits the contract URL and a green OK badge appears
    await waitFor(() => {
      const posts = calls.filter(
        (c) =>
          c.method === "POST" &&
          c.url === `/api/clients/${acme.id}/channels/${TELEGRAM_CHANNEL_ID}/test`,
      );
      expect(posts).toHaveLength(1);
    });
    expect(
      await within(dialog).findByText(/OK\s*·\s*340\s*ms/),
    ).not.toBeNull();
  });

  it("surfaces upstream failure detail in red without breaking the panel", async () => {
    // Given: the same panel, but the Telegram probe reports ok:false
    setToken("test-token");
    const persisted: Channel[] = [telegramChannel()];
    const calls: RecordedCall[] = [];
    vi.stubGlobal(
      "fetch",
      stubFetch(
        [
          clientsRoute(),
          channelsListRoute(persisted),
          testChannelRoute({
            ok: false,
            detail: "telegram getMe failed with upstream status 401",
          }),
        ],
        calls,
      ),
    );
    const dialog = await openChannelsPanel();
    const row = (await within(dialog).findByText(/@secops/)).closest("tr");
    expect(row).not.toBeNull();

    // When: the admin runs Test connection on the Telegram row
    fireEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "Test connection" }),
    );

    // Then: the failure detail lands in the status line, panel still usable
    expect(
      await within(dialog).findByText(/getMe failed with upstream status 401/),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Add channel" }),
    ).toBeTruthy();
  });

  it("shows no Test connection button on WHATSAPP and EMAIL rows", async () => {
    // Given: Acme's panel with one channel of each non-telegram type
    setToken("test-token");
    const persisted: Channel[] = [whatsappChannel("12025550123"), emailChannel(["a@corp.io"])];
    const calls: RecordedCall[] = [];
    vi.stubGlobal(
      "fetch",
      stubFetch([clientsRoute(), channelsListRoute(persisted)], calls),
    );
    const dialog = await openChannelsPanel();

    // Then: only Telegram rows offer Test connection
    expect(within(dialog).queryByRole("button", { name: "Test connection" })).toBeNull();
  });
});
