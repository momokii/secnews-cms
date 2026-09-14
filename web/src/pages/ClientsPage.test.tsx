import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientsPage } from "./ClientsPage";
import { setToken } from "../lib/tokenStore";
import type { Channel, Client } from "../lib/clientsApi";

const acme: Client = {
  id: 3,
  name: "Acme Corp",
  active: true,
  createdAt: "2026-09-01T09:00:00.000Z",
  updatedAt: "2026-09-01T09:00:00.000Z",
};

function telegramChannel(
  overrides: Partial<Extract<Channel, { type: "TELEGRAM" }>> = {},
): Channel {
  return {
    type: "TELEGRAM",
    id: 9,
    clientId: 3,
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
    id: 11,
    clientId: 3,
    chatId,
    active: true,
    createdAt: "2026-09-14T08:00:00.000Z",
    updatedAt: "2026-09-14T08:00:00.000Z",
  };
}

function emailChannel(bcc: string[]): Channel {
  return {
    type: "EMAIL",
    id: 12,
    clientId: 3,
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
 * `calls` log of mutating requests so tests assert on exact wire bodies.
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
    if (method !== "GET" && init?.body !== undefined) {
      calls.push({
        url,
        method,
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      });
    }
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

describe("FE-CHN-01: channel create sends the per-type discriminated body", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("creates WHATSAPP, TELEGRAM, and EMAIL channels with contract-exact shapes", async () => {
    // Given: Acme Corp exists and its channels panel is open and empty
    setToken("test-token");
    const calls: RecordedCall[] = [];
    vi.stubGlobal(
      "fetch",
      stubFetch(
        [
          clientsRoute(),
          {
            match: (url, method) =>
              method === "POST" && url === "/api/clients/3/channels",
            respond: (init) => {
              const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
              const channel =
                body.type === "TELEGRAM"
                  ? telegramChannel({ chatId: String(body.chatId) })
                  : body.type === "WHATSAPP"
                    ? whatsappChannel(String(body.chatId))
                    : emailChannel(body.bcc as string[]);
              return new Response(JSON.stringify(channel), { status: 201 });
            },
          },
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
    expect(posts[0].url).toBe("/api/clients/3/channels");
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

    // And: the Telegram row shows the masked token only — never the raw one
    expect(await within(dialog).findByText(/111222:AA…x9Z/)).not.toBeNull();
    expect(document.body.textContent).not.toContain("AAE-rawtoken");
  });
});

describe("FE-CHN-02: channel active toggle PATCHes only {active}", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("flips a channel to inactive via PATCH /channels/:id and renders the new state", async () => {
    // Given: Acme's panel holds one active Telegram channel (id 9)
    setToken("test-token");
    const calls: RecordedCall[] = [];
    vi.stubGlobal(
      "fetch",
      stubFetch(
        [
          clientsRoute(),
          {
            match: (url, method) =>
              method === "POST" && url === "/api/clients/3/channels",
            respond: () =>
              new Response(JSON.stringify(telegramChannel()), { status: 201 }),
          },
          {
            match: (url, method) => method === "PATCH" && url === "/api/channels/9",
            respond: () =>
              new Response(JSON.stringify(telegramChannel({ active: false })), {
                status: 200,
              }),
          },
        ],
        calls,
      ),
    );
    const dialog = await openChannelsPanel();

    // Seed one channel through the editor
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

    // Then: PATCH /channels/9 carries exactly {active:false} — no token echo
    await waitFor(() => {
      const patches = calls.filter((c) => c.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(patches[0].url).toBe("/api/channels/9");
    });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ active: false });
    expect(JSON.stringify(patch?.body)).not.toContain("token");

    // And: the row reflects the server state
    expect(await within(dialog).findByText("Inactive")).not.toBeNull();
  });
});
