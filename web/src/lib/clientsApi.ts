import { apiFetch } from "./api";

/** Wire types + fetch functions for Surface 6 — clients + channels
 * (contract #40-46). Telegram responses carry tokenMasked/hasToken, never the
 * raw token (CHN-02). Channels are read from the persisted list endpoint
 * (#44b); create/patch/delete mutate it. */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Client {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ClientInput = { name: string };
export type ClientPatch = Partial<{ name: string; active: boolean }>;

export type ChannelType = "WHATSAPP" | "TELEGRAM" | "EMAIL";

/** Wire shape per type — discriminated so FE forms stay total (contract §7). */
export type Channel =
  | {
      type: "WHATSAPP";
      id: string;
      clientId: string;
      chatId: string;
      active: boolean;
      createdAt: string;
      updatedAt: string;
    }
  | {
      type: "TELEGRAM";
      id: string;
      clientId: string;
      chatId: string;
      /** Never the raw token — masked form like "123456:AA…x9Z". */
      tokenMasked: string;
      hasToken: boolean;
      active: boolean;
      createdAt: string;
      updatedAt: string;
    }
  | {
      type: "EMAIL";
      id: string;
      clientId: string;
      bcc: string[];
      active: boolean;
      createdAt: string;
      updatedAt: string;
    };

export type CreateChannelBody =
  | { type: "WHATSAPP"; chatId: string }
  | { type: "TELEGRAM"; chatId: string; token: string }
  | { type: "EMAIL"; bcc: string[] };

/** PATCH /channels/:id — active toggle + field updates (token optional replace). */
export type ChannelPatch = Partial<
  { active: boolean; chatId: string; token: string; bcc: string[] }
>;

const DEFAULT_PAGE_SIZE = 20;

export async function listClients(
  query: { page?: number; pageSize?: number; q?: string } = {},
): Promise<Paginated<Client>> {
  const search = new URLSearchParams();
  search.set("page", String(query.page ?? 1));
  search.set("pageSize", String(query.pageSize ?? DEFAULT_PAGE_SIZE));
  if (query.q !== undefined && query.q !== "") {
    search.set("q", query.q);
  }
  const response = await apiFetch(`/clients?${search.toString()}`, {
    method: "GET",
  });
  return (await response.json()) as Paginated<Client>;
}

export async function createClient(body: ClientInput): Promise<Client> {
  const response = await apiFetch("/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as Client;
}

export async function updateClient(
  id: string,
  patch: ClientPatch,
): Promise<Client> {
  const response = await apiFetch(`/clients/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return (await response.json()) as Client;
}

export async function deleteClient(id: string): Promise<void> {
  await apiFetch(`/clients/${id}`, { method: "DELETE" });
}

export async function listChannels(clientId: string): Promise<Channel[]> {
  const response = await apiFetch(`/clients/${clientId}/channels`, {
    method: "GET",
  });
  return (await response.json()) as Channel[];
}

export async function createChannel(
  clientId: string,
  body: CreateChannelBody,
): Promise<Channel> {
  const response = await apiFetch(`/clients/${clientId}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as Channel;
}

export async function updateChannel(
  id: string,
  patch: ChannelPatch,
): Promise<Channel> {
  const response = await apiFetch(`/channels/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return (await response.json()) as Channel;
}

export async function deleteChannel(id: string): Promise<void> {
  await apiFetch(`/channels/${id}`, { method: "DELETE" });
}

/** POST /clients/:clientId/channels/:id/test — upstream failures answer
 * ok:false with detail, not an HTTP error (same shape as integration tests). */
export interface ChannelTestResponse {
  ok: boolean;
  detail?: string;
  latencyMs?: number;
}

export async function testChannel(
  clientId: string,
  channelId: string,
): Promise<ChannelTestResponse> {
  const response = await apiFetch(
    `/clients/${clientId}/channels/${channelId}/test`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  return (await response.json()) as ChannelTestResponse;
}
