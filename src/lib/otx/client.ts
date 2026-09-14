import type { FetchLike } from "../../modules/ai/providers/types.js";

/**
 * OTX AlienVault REST client (Surface 8b): TLP mapping and pulse push.
 *   POST /api/v1/pulses/create        — push a new pulse
 * Pulse reads (subscribed / my / search / detail) live in ./read.js.
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
