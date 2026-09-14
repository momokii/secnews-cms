import { apiFetch } from "./api";
import type { Paginated } from "./feedsApi";

/** Wire types + fetch functions for Surface 8 — bulletin template, preview,
 * OTX pulses (contract #49-51, #53). Push (#52) lives with the ticket UI. */

export interface BulletinTemplate {
  template: string;
}

export interface BulletinPreview {
  rendered: string;
}

/** Legacy TLP tag OTX uses on the wire (docs/STATES.md §4 mapping). */
export type OtxTlp = "WHITE" | "GREEN" | "AMBER" | "RED";

export interface OtxPulse {
  id: string;
  name: string;
  authorName: string;
  isPublic: boolean;
  tlp: OtxTlp;
  tags: string[];
  indicatorCount: number;
  created: string | null;
  modified: string | null;
}

export async function getBulletinTemplate(): Promise<BulletinTemplate> {
  const response = await apiFetch("/bulletin/template", { method: "GET" });
  return (await response.json()) as BulletinTemplate;
}

export async function putBulletinTemplate(
  template: string,
): Promise<BulletinTemplate> {
  const response = await apiFetch("/bulletin/template", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template }),
  });
  return (await response.json()) as BulletinTemplate;
}

/** POST /tickets/:id/bulletin/preview — renders the exact defanged body
 * (422 VALIDATION when the ticket misses required final fields). */
export async function previewBulletin(
  ticketId: string,
): Promise<BulletinPreview> {
  const response = await apiFetch(`/tickets/${ticketId}/bulletin/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return (await response.json()) as BulletinPreview;
}

export type OtxPulseSource = "subscribed" | "mine" | "search";

export interface OtxPulseDetail {
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
}

/** GET /otx/pulses — source picks subscribed / My pulses / server-side search;
 * pageSize is clamped server-side to the OTX limit ceiling of 50. */
export interface OtxPulsesQuery {
  page: number;
  source: OtxPulseSource;
  pageSize?: number;
  q?: string;
}

export async function listOtxPulses({
  page,
  source,
  pageSize = 20,
  q,
}: OtxPulsesQuery): Promise<Paginated<OtxPulse>> {
  const search = q === undefined || q === "" ? "" : `&q=${encodeURIComponent(q)}`;
  const response = await apiFetch(
    `/otx/pulses?page=${page}&source=${source}&pageSize=${pageSize}${search}`,
    { method: "GET" },
  );
  return (await response.json()) as Paginated<OtxPulse>;
}

/** GET /otx/pulses/:id — full pulse detail behind the server proxy. */
export async function getOtxPulse(id: string): Promise<OtxPulseDetail> {
  const response = await apiFetch(`/otx/pulses/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  return (await response.json()) as OtxPulseDetail;
}
