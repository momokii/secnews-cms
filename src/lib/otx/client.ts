import type { FetchLike } from "../../modules/ai/providers/types.js";
import type { IocType } from "../../generated/prisma/enums.js";
import { upstreamFailure } from "../../common/upstream.js";

/**
 * OTX AlienVault REST client (Surface 8b): TLP mapping and pulse push.
 *   POST  /api/v1/pulses/create     — push a new pulse
 *   PATCH /api/v1/pulses/{id}       — edit an existing pulse (documented:
 *                                     "Any fields that can be used to create
 *                                     a pulse can also be used to edit")
 * Pulse reads (subscribed / my / search / detail) live in ./read.js.
 * Auth is the X-OTX-API-KEY header; the key comes from central integration
 * config (never the request). `fetch` is injectable so tests stub the wire;
 * production late-binds globalThis.fetch. TLP mapping per docs/STATES.md §4:
 * internal CLEAR → legacy WHITE marking; AMBER/RED force public=false. The
 * wire value is the LOWERCASE legacy name (official external API schema enum:
 * white|green|amber|red). Indicators are typed {indicator,type} objects with
 * the exact type names from OTX-Python-SDK IndicatorTypes.py.
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

/** The create-shaped body, identical for create and documented PATCH edits. */
function pulseBody(input: CreatePulseInput): OtxPulseBody {
  return {
    name: input.name,
    description: input.description,
    public: input.isPublic !== false && publicAllowed(input.tlp),
    TLP: toOtxMarking(input.tlp).toLowerCase(),
    tags: input.tags,
    references: input.references,
    indicators: toOtxIndicators(input.indicators),
  };
}

async function postPulseBody(
  input: CreatePulseInput,
  path: string,
  method: "POST" | "PATCH",
): Promise<Response> {
  const base = input.baseUrl ?? OTX_BASE;
  const doFetch = input.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  return doFetch(`${base}${path}`, {
    method,
    headers: {
      "X-OTX-API-KEY": input.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pulseBody(input)),
  });
}

/** POST /api/v1/pulses/create. Rejects non-2xx with status + body snippet. */
export async function createPulse(input: CreatePulseInput): Promise<CreatedPulse> {
  const response = await postPulseBody(input, "/api/v1/pulses/create", "POST");
  if (!response.ok) {
    throw await upstreamFailure("OTX", response);
  }
  const body = (await response.json()) as { id?: unknown };
  if (typeof body.id !== "string" || body.id === "") {
    throw new Error("OTX create returned no pulse id");
  }
  return { id: body.id, url: `${input.baseUrl ?? OTX_BASE}/pulse/${body.id}` };
}

/** PATCH /api/v1/pulses/{id} — documented edit of an existing pulse. */
export async function updatePulse(pulseId: string, input: CreatePulseInput): Promise<CreatedPulse> {
  const base = input.baseUrl ?? OTX_BASE;
  const response = await postPulseBody(input, `/api/v1/pulses/${pulseId}`, "PATCH");
  if (!response.ok) {
    throw await upstreamFailure("OTX", response);
  }
  return { id: pulseId, url: `${base}/pulse/${pulseId}` };
}
