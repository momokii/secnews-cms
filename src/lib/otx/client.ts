import type { FetchLike } from "../../modules/ai/providers/types.js";
import type { IocType } from "../../generated/prisma/enums.js";
import { upstreamFailure } from "../../common/upstream.js";
import { getPulse } from "./read.js";

/**
 * OTX AlienVault REST client (Surface 8b): TLP mapping and pulse push.
 *   POST  /api/v1/pulses/create     — push a new pulse
 *   PATCH /api/v1/pulses/{id}       — edit an existing pulse
 * Pulse reads (subscribed / my / search / detail) live in ./read.js.
 * Auth is the X-OTX-API-KEY header; the key comes from central integration
 * config (never the request). `fetch` is injectable so tests stub the wire;
 * production late-binds globalThis.fetch. TLP mapping per docs/STATES.md §4:
 * internal CLEAR → legacy WHITE marking; AMBER/RED force public=false. The
 * wire value is the LOWERCASE legacy name (official external API schema enum:
 * white|green|amber|red). Indicators are typed {indicator,type} objects with
 * the exact type names from OTX-Python-SDK IndicatorTypes.py.
 *
 * PATCH edits are DIFF-based (TASK-SYNCDEL): the documented update semantics
 * reject plain list arrays with a 500 — list fields must arrive as
 * {add:[...]} / {remove:[...]} dicts. The current pulse is read first via
 * the detail mapper; indicators diff by (indicator,type) — add the missing
 * objects, remove the {id} of stale rows — tags/references diff as string
 * lists, empty ops are omitted entirely, and the scalars (name, description,
 * public, TLP) always go as literals.
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

/** IOC as stored on a ticket row. */
export type OtxIndicatorInput = { type: IocType; value: string };

/** Our IocType → the exact `type` string OTX accepts on pulse bodies
 * (OTX-Python-SDK IndicatorTypes.py). OTHER has no OTX equivalent → null. */
const OTX_INDICATOR_TYPES: Record<IocType, string | null> = {
  DOMAIN: "domain",
  IPV4: "IPv4",
  IPV6: "IPv6",
  URL: "URL",
  EMAIL: "email",
  MD5: "FileHash-MD5",
  SHA1: "FileHash-SHA1",
  SHA256: "FileHash-SHA256",
  FILEPATH: "FilePath",
  MUTEX: "Mutex",
  CIDR: "CIDR",
  OTHER: null,
};

/** Map ticket IOCs to the documented wire objects, dropping OTHER. */
export function toOtxIndicators(
  indicators: OtxIndicatorInput[],
): Array<{ indicator: string; type: string }> {
  return indicators.flatMap((ioc) => {
    const type = OTX_INDICATOR_TYPES[ioc.type];
    return type === null ? [] : [{ indicator: ioc.value, type }];
  });
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
  /** Included IOCs — mapped to typed OTX wire objects here. */
  indicators: OtxIndicatorInput[];
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

export type CreatedPulse = {
  id: string;
  url: string;
};

type OtxPulseBody = {
  name: string;
  description: string;
  public: boolean;
  TLP: string;
  tags: string[];
  references: string[];
  indicators: Array<{ indicator: string; type: string }>;
};

/** OTX rejects descriptions over 1024 chars ("description Must be 0-1024
 * chars"); a 1882-char bulletin once failed every push with upstream 400.
 * Cap at 1023 content chars + '…'. Name is NOT truncated (uniqueness hint). */
export function truncateOtxDescription(description: string): string {
  return description.length <= 1024 ? description : `${description.slice(0, 1023)}…`;
}

/** The create-shaped body for POST /api/v1/pulses/create. */
function pulseBody(input: CreatePulseInput): OtxPulseBody {
  return {
    name: input.name,
    description: truncateOtxDescription(input.description),
    public: input.isPublic !== false && publicAllowed(input.tlp),
    TLP: toOtxMarking(input.tlp).toLowerCase(),
    tags: input.tags,
    references: input.references,
    indicators: toOtxIndicators(input.indicators),
  };
}

async function postPulseBody(input: CreatePulseInput, path: string): Promise<Response> {
  const base = input.baseUrl ?? OTX_BASE;
  const doFetch = input.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  return doFetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "X-OTX-API-KEY": input.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pulseBody(input)),
  });
}

/** POST /api/v1/pulses/create. Rejects non-2xx with status + body snippet. */
export async function createPulse(input: CreatePulseInput): Promise<CreatedPulse> {
  const response = await postPulseBody(input, "/api/v1/pulses/create");
  if (!response.ok) {
    throw await upstreamFailure("OTX", response);
  }
  const body = (await response.json()) as { id?: unknown };
  if (typeof body.id !== "string" || body.id === "") {
    throw new Error("OTX create returned no pulse id");
  }
  return { id: body.id, url: `${input.baseUrl ?? OTX_BASE}/pulse/${body.id}` };
}

/** PATCH /api/v1/pulses/{id} — documented edit of an existing pulse, sent
 * as the diff body ({add,remove} dicts, scalar literals) after reading the
 * current pulse through the detail mapper. */
export async function updatePulse(pulseId: string, input: CreatePulseInput): Promise<CreatedPulse> {
  const base = input.baseUrl ?? OTX_BASE;
  const current = await getPulse({
    apiKey: input.apiKey,
    id: pulseId,
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
  });

  const desired = toOtxIndicators(input.indicators);
  const currentKeys = new Set(current.indicators.map((row) => `${row.value}\u0000${row.type}`));
  const desiredKeys = new Set(desired.map((row) => `${row.indicator}\u0000${row.type}`));
  const addIndicators = desired.filter((row) => !currentKeys.has(`${row.indicator}\u0000${row.type}`));
  // Remove ops name OTX's own row ids verbatim (OTX sends numbers).
  // Rows without an upstream id cannot be named upstream, so they are skipped
  // rather than sent as {id: null} — OTX silently ignores those.
  const removeIndicators = current.indicators
    .filter((row) => row.id !== null && !desiredKeys.has(`${row.value}\u0000${row.type}`))
    .map((row) => ({ id: row.id }));

  const doFetch = input.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const response = await doFetch(`${base}/api/v1/pulses/${pulseId}`, {
    method: "PATCH",
    headers: {
      "X-OTX-API-KEY": input.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      description: truncateOtxDescription(input.description),
      public: input.isPublic !== false && publicAllowed(input.tlp),
      TLP: toOtxMarking(input.tlp).toLowerCase(),
      indicators: listOp(addIndicators, removeIndicators),
      tags: listOp(...diffStrings(input.tags, current.tags)),
      references: listOp(...diffStrings(input.references, current.references)),
    }),
  });
  if (!response.ok) {
    throw await upstreamFailure("OTX", response);
  }
  return { id: pulseId, url: `${base}/pulse/${pulseId}` };
}

/** The documented list-op dict; absent (undefined → key dropped by JSON)
 * when both sides are empty, empty sides omitted. */
function listOp<A, R>(add: A[], remove: R[]): { add?: A[]; remove?: R[] } | undefined {
  if (add.length === 0 && remove.length === 0) {
    return undefined;
  }
  return {
    ...(add.length === 0 ? {} : { add }),
    ...(remove.length === 0 ? {} : { remove }),
  };
}

function diffStrings(desired: string[], current: string[]): [string[], string[]] {
  return [desired.filter((value) => !current.includes(value)), current.filter((value) => !desired.includes(value))];
}
