import type { FetchLike } from "../../modules/ai/providers/types.js";
import { OTX_BASE, type OtxTlp } from "./client.js";

/**
 * OTX AlienVault pulse reads (Surface 8b): subscribed / my / search pages and
 * the full-pulse detail. Auth is the X-OTX-API-KEY header; the key comes from
 * central integration config (never the request). `fetch` is injectable so
 * tests stub the wire; production late-binds globalThis.fetch. Datetimes
 * arrive timezone-less and normalize to ISO, null when unparseable.
 */

export type ListPulsesInput = {
  apiKey: string;
  page: number;
  pageSize?: number;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

/** One listed pulse mapped to the wire shape (OtxPulseSchema). */
export type SubscribedPulse = {
  id: string;
  name: string;
  authorName: string;
  isPublic: boolean;
  tlp: OtxTlp;
  tags: string[];
  indicatorCount: number;
  created: string | null;
  modified: string | null;
};

type OtxPulseResponse = {
  id?: unknown;
  name?: unknown;
  author_name?: unknown;
  public?: unknown;
  TLP?: unknown;
  tags?: unknown;
  indicator_count?: unknown;
  indicators?: unknown;
  created?: unknown;
  modified?: unknown;
};

type OtxSubscribedResponse = { count?: unknown; results?: unknown };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** OTX sends datetimes without a timezone; normalize to ISO, null when unparseable. */
function asIsoDateTime(value: unknown): string | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** OTX tags arrive as strings or {name} objects — normalize to strings. */
function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((tag) => (typeof tag === "string" ? tag : asString((tag as { name?: unknown })?.name)));
}

const OTX_TLPS: readonly OtxTlp[] = ["WHITE", "GREEN", "AMBER", "RED"];

/**
 * Subscribed/my list rows omit indicator_count and carry an embedded
 * indicators array instead (search rows carry the count). Prefer the explicit
 * count; derive from the embedded array when absent; 0 only when neither.
 */
function asIndicatorCount(count: unknown, indicators: unknown): number {
  if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
    return count;
  }
  if (Array.isArray(indicators)) {
    return asIndicators(indicators).length;
  }
  return 0;
}

function asPulse(row: unknown): SubscribedPulse | null {
  if (typeof row !== "object" || row === null) {
    return null;
  }
  const pulse = row as OtxPulseResponse;
  if (typeof pulse.id !== "string") {
    return null;
  }
  const rawTlp = asString(pulse.TLP) as OtxTlp;
  return {
    id: pulse.id,
    name: asString(pulse.name),
    authorName: asString(pulse.author_name),
    isPublic: pulse.public === true,
    tlp: OTX_TLPS.includes(rawTlp) ? rawTlp : "AMBER",
    tags: asTags(pulse.tags),
    indicatorCount: asIndicatorCount(pulse.indicator_count, pulse.indicators),
    created: asIsoDateTime(pulse.created),
    modified: asIsoDateTime(pulse.modified),
  };
}

/** GET /api/v1/pulses/subscribed?limit=<pageSize>&page=<page>. Returns the mapped page. */
export async function listSubscribed(input: ListPulsesInput): Promise<{ total: number; pulses: SubscribedPulse[] }> {
  const base = input.baseUrl ?? OTX_BASE;
  const doFetch = input.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const pageSize = input.pageSize ?? 20;
  const response = await doFetch(`${base}/api/v1/pulses/subscribed?limit=${pageSize}&page=${input.page}`, {
    headers: { "X-OTX-API-KEY": input.apiKey },
  });
  if (!response.ok) {
    throw new Error(`OTX request failed with upstream status ${response.status}`);
  }
  const body = (await response.json()) as OtxSubscribedResponse;
  const rows = Array.isArray(body.results) ? body.results : [];
  const pulses = rows.map(asPulse).filter((pulse): pulse is SubscribedPulse => pulse !== null);
  return {
    total: typeof body.count === "number" ? body.count : pulses.length,
    pulses,
  };
}

/** GET /api/v1/pulses/my?limit=<pageSize>&page=<page>. Returns the mapped page. */
export async function listMyPulses(input: ListPulsesInput): Promise<{ total: number; pulses: SubscribedPulse[] }> {
  const base = input.baseUrl ?? OTX_BASE;
  const doFetch = input.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const pageSize = input.pageSize ?? 20;
  const response = await doFetch(`${base}/api/v1/pulses/my?limit=${pageSize}&page=${input.page}`, {
    headers: { "X-OTX-API-KEY": input.apiKey },
  });
  if (!response.ok) {
    throw new Error(`OTX request failed with upstream status ${response.status}`);
  }
  const body = (await response.json()) as OtxSubscribedResponse;
  const rows = Array.isArray(body.results) ? body.results : [];
  const pulses = rows.map(asPulse).filter((pulse): pulse is SubscribedPulse => pulse !== null);
  return {
    total: typeof body.count === "number" ? body.count : pulses.length,
    pulses,
  };
}

export type SearchPulsesInput = {
  apiKey: string;
  q: string;
  page: number;
  pageSize?: number;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

/**
 * GET /api/v1/search/pulses?q=&limit=&page= — the only OTX endpoint with `q`
 * support (subscribed/my accept just limit/page/since). Results use the same
 * pulse mapping as the list feeds.
 */
export async function searchPulses(input: SearchPulsesInput): Promise<{ total: number; pulses: SubscribedPulse[] }> {
  const base = input.baseUrl ?? OTX_BASE;
  const doFetch = input.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const params = new URLSearchParams();
  if (input.q !== "") {
    params.set("q", input.q);
  }
  params.set("limit", String(input.pageSize ?? 20));
  params.set("page", String(input.page));
  const response = await doFetch(`${base}/api/v1/search/pulses?${params.toString()}`, {
    headers: { "X-OTX-API-KEY": input.apiKey },
  });
  if (!response.ok) {
    throw new Error(`OTX request failed with upstream status ${response.status}`);
  }
  const body = (await response.json()) as OtxSubscribedResponse;
  const rows = Array.isArray(body.results) ? body.results : [];
  const pulses = rows.map(asPulse).filter((pulse): pulse is SubscribedPulse => pulse !== null);
  return {
    total: typeof body.count === "number" ? body.count : pulses.length,
    pulses,
  };
}

/** One pulse detail mapped to the wire shape (OtxPulseDetailSchema). */
export type PulseDetail = {
  id: string;
  name: string;
  authorName: string;
  description: string;
  isPublic: boolean;
  tlp: OtxTlp;
  tags: string[];
  references: string[];
  indicators: Array<{ value: string; type: string }>;
  created: string | null;
  modified: string | null;
};

type OtxIndicatorResponse = { indicator?: unknown; type?: unknown };

type OtxPulseDetailResponse = OtxPulseResponse & {
  description?: unknown;
  references?: unknown;
  indicators?: unknown;
};

function asReferences(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((row): row is string => typeof row === "string" && row !== "");
}

function asIndicators(value: unknown): Array<{ value: string; type: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((row) => row as OtxIndicatorResponse)
    .filter((row) => typeof row.indicator === "string" && row.indicator !== "")
    .map((row) => ({ value: row.indicator as string, type: asString(row.type) }));
}

/** GET /api/v1/pulses/:id — full pulse the configured key can access. */
export async function getPulse(input: {
  apiKey: string;
  id: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<PulseDetail> {
  const base = input.baseUrl ?? OTX_BASE;
  const doFetch = input.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const response = await doFetch(`${base}/api/v1/pulses/${encodeURIComponent(input.id)}`, {
    headers: { "X-OTX-API-KEY": input.apiKey },
  });
  if (!response.ok) {
    throw new Error(`OTX request failed with upstream status ${response.status}`);
  }
  const body = (await response.json()) as OtxPulseDetailResponse;
  if (typeof body.id !== "string" || body.id === "") {
    throw new Error("OTX detail returned no pulse id");
  }
  const rawTlp = asString(body.TLP) as OtxTlp;
  return {
    id: body.id,
    name: asString(body.name),
    authorName: asString(body.author_name),
    description: asString(body.description),
    isPublic: body.public === true,
    tlp: OTX_TLPS.includes(rawTlp) ? rawTlp : "AMBER",
    tags: asTags(body.tags),
    references: asReferences(body.references),
    indicators: asIndicators(body.indicators),
    created: asIsoDateTime(body.created),
    modified: asIsoDateTime(body.modified),
  };
}
