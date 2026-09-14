import { apiFetch } from "./api";

/** Wire types + fetch functions for Surface 2 — feeds, feed items (contract #12-19). */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeedSourceInput {
  name: string;
  url: string;
  active: boolean;
}

export type FeedSourcePatch = Partial<FeedSourceInput>;

/** Canonical triage states: UNREVIEWED -> VIEWED -> TAKEN (docs/STATES.md). */
export type FeedItemStatus = "UNREVIEWED" | "VIEWED" | "TAKEN";

export interface FeedItem {
  id: string;
  feedSourceId: string;
  guid: string;
  title: string;
  url: string;
  publishedAt: string;
  summary: string | null;
  status: FeedItemStatus;
  /** Set when TAKEN — back-reference to the spawned ticket. */
  ticketId: string | null;
  fetchedAt: string;
}

export interface FeedItemsQuery {
  status?: FeedItemStatus;
  feedSourceId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Fields the triage UI consumes from the 201 ticket returned by take. */
export interface TicketSummary {
  id: string;
  title: string;
}

const DEFAULT_PAGE_SIZE = 20;

/** Builds "a=1&b=2" from defined params only; booleans/numbers stringify. */
function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded === "" ? "" : `?${encoded}`;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function listFeeds(
  query: { page?: number; pageSize?: number } = {},
): Promise<Paginated<FeedSource>> {
  const response = await apiFetch(
    `/feeds${buildQuery({
      page: query.page,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    })}`,
    { method: "GET" },
  );
  return readJson<Paginated<FeedSource>>(response);
}

export async function createFeed(body: FeedSourceInput): Promise<FeedSource> {
  const response = await apiFetch("/feeds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<FeedSource>(response);
}

export async function updateFeed(
  id: string,
  patch: FeedSourcePatch,
): Promise<FeedSource> {
  const response = await apiFetch(`/feeds/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return readJson<FeedSource>(response);
}

export async function deleteFeed(id: string): Promise<void> {
  await apiFetch(`/feeds/${id}`, { method: "DELETE" });
}

export async function listFeedItems(
  query: FeedItemsQuery = {},
): Promise<Paginated<FeedItem>> {
  const response = await apiFetch(
    `/feed-items${buildQuery({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
      status: query.status,
      feedSourceId: query.feedSourceId,
      q: query.q,
    })}`,
    { method: "GET" },
  );
  return readJson<Paginated<FeedItem>>(response);
}

/** POST /feed-items/:id/view — UNREVIEWED -> VIEWED (409 when already TAKEN). */
export async function viewFeedItem(id: string): Promise<FeedItem> {
  const response = await apiFetch(`/feed-items/${id}/view`, {
    method: "POST",
  });
  return readJson<FeedItem>(response);
}

/** POST /feed-items/:id/take — item -> TAKEN, returns the spawned ticket. */
export async function takeFeedItem(id: string): Promise<TicketSummary> {
  const response = await apiFetch(`/feed-items/${id}/take`, {
    method: "POST",
  });
  return readJson<TicketSummary>(response);
}
