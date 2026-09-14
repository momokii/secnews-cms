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
  isPublic: boolean;
  tlp: OtxTlp;
  tags: string[];
  indicatorCount: number;
  created: string;
  modified: string;
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
  ticketId: number,
): Promise<BulletinPreview> {
  const response = await apiFetch(`/tickets/${ticketId}/bulletin/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return (await response.json()) as BulletinPreview;
}

/** GET /otx/pulses — page is the only query param the contract accepts. */
export async function listOtxPulses(page: number): Promise<Paginated<OtxPulse>> {
  const response = await apiFetch(`/otx/pulses?page=${page}`, {
    method: "GET",
  });
  return (await response.json()) as Paginated<OtxPulse>;
}
