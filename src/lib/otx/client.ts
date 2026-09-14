import type { FetchLike } from "../../modules/ai/providers/types.js";

/**
 * OTX AlienVault REST client (Surface 8b). Endpoints used:
 *   POST /api/v1/pulses/create        — push a new pulse
 *   GET  /api/v1/pulses/subscribed    — paginated subscribed-pulse proxy
 * Auth is the X-OTX-API-KEY header; the key comes from central integration
 * config (never the request). `fetch` is injectable so tests stub the wire;
 * production late-binds globalThis.fetch. TLP mapping per docs/STATES.md §4:
 * internal CLEAR → legacy WHITE marking; AMBER/RED force public=false.
 */

export const OTX_BASE = "https://otx.alienvault.com";

/** Internal TlpLevel values (Prisma enum). */
export type InternalTlp = "CLEAR" | "GREEN" | "AMBER" | "RED";
/** Legacy TLP tag OTX carries on the wire. */
export type OtxTlp = "WHITE" | "GREEN" | "AMBER" | "RED";

/** CLEAR maps to OTX's legacy WHITE; the rest keep their name. */
export function toOtxMarking(tlp: InternalTlp): OtxTlp {
  return tlp === "CLEAR" ? "WHITE" : tlp;
}

/** OTX pulse semantics: only CLEAR/GREEN pulses may be public. */
export function publicAllowed(tlp: InternalTlp): boolean {
  return tlp === "CLEAR" || tlp === "GREEN";
}

export type CreatePulseInput = {
  apiKey: string;
  name: string;
  description: string;
  /** Internal TLP of the ticket — mapped + privacy-forced here. */
  tlp: InternalTlp;
  /** Honored only for CLEAR/GREEN; AMBER/RED always push private. */
  isPublic?: boolean;
  tags: string[];
  references: string[];
  /** Raw IOC values — defanging is a bulletin-render concern, not an OTX one. */
  indicators: string[];
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

export type CreatedPulse = {
  id: string;
  url: string;
};

type OtxCreateResponse = { id?: unknown };

/** POST /api/v1/pulses/create. Rejects non-2xx with the upstream status. */
export async function createPulse(input: CreatePulseInput): Promise<CreatedPulse> {
  const base = input.baseUrl ?? OTX_BASE;
  const doFetch = input.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const isPublic = input.isPublic !== false && publicAllowed(input.tlp);
  const response = await doFetch(`${base}/api/v1/pulses/create`, {
    method: "POST",
    headers: {
      "X-OTX-API-KEY": input.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      public: isPublic,
      TLP: toOtxMarking(input.tlp),
      tags: input.tags,
      references: input.references,
      indicators: input.indicators,
    }),
  });
  if (!response.ok) {
    throw new Error(`OTX request failed with upstream status ${response.status}`);
  }
  const body = (await response.json()) as OtxCreateResponse;
  if (typeof body.id !== "string" || body.id === "") {
    throw new Error("OTX create returned no pulse id");
  }
  return { id: body.id, url: `${base}/pulse/${body.id}` };
}

export type ListPulsesInput = {
  apiKey: string;
  page: number;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

/** One subscribed pulse mapped to the wire shape (OtxPulseSchema). */
export type SubscribedPulse = {
  id: string;
  name: string;
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
  public?: unknown;
  TLP?: unknown;
  tags?: unknown;
  indicator_count?: unknown;
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
    isPublic: pulse.public === true,
    tlp: OTX_TLPS.includes(rawTlp) ? rawTlp : "AMBER",
    tags: asTags(pulse.tags),
    indicatorCount: typeof pulse.indicator_count === "number" ? pulse.indicator_count : 0,
    created: asIsoDateTime(pulse.created),
    modified: asIsoDateTime(pulse.modified),
  };
}

/** GET /api/v1/pulses/subscribed?page=<page>. Returns the mapped page. */
export async function listSubscribed(input: ListPulsesInput): Promise<{ total: number; pulses: SubscribedPulse[] }> {
  const base = input.baseUrl ?? OTX_BASE;
  const doFetch = input.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const response = await doFetch(`${base}/api/v1/pulses/subscribed?page=${input.page}`, {
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
