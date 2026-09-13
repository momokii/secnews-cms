import { z } from "zod/v4";
import { paginated, pageQuery } from "../../common/pagination.js";

/** OTX push + subscribed-pulse proxy. Push role ADMIN/EDITOR; guards identical
 * to send: ticket READY (422 VALIDATION) and zero PENDING suggestions
 * (409 PENDING_SUGGESTIONS). TLP mapping per docs/STATES.md: CLEAR→WHITE;
 * public=false forced when RED or AMBER. */

// POST /tickets/:id/otx — empty body; IOCs + TLP come from the ticket.
export const PushOtxResponseSchema = z.object({
  pulseId: z.string(),
  pulseUrl: z.url(),
  isPublic: z.boolean(),
  tlpMarking: z.enum(["WHITE", "GREEN", "AMBER", "RED"]),
});
export type PushOtxResponse = z.infer<typeof PushOtxResponseSchema>;

/** Legacy TLP tag OTX uses on the wire — mapped from internal TLP on create. */
export const OtxTlpEnum = z.enum(["WHITE", "GREEN", "AMBER", "RED"]);

/** Subset of the OTX pulse object the pulses page renders. */
export const OtxPulseSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPublic: z.boolean(),
  tlp: OtxTlpEnum,
  tags: z.array(z.string()),
  indicatorCount: z.number().int().min(0),
  created: z.iso.datetime(),
  modified: z.iso.datetime(),
});
export type OtxPulse = z.infer<typeof OtxPulseSchema>;

// GET /otx/pulses
export const ListPulsesQuerySchema = pageQuery.pick({ page: true });
export const ListPulsesResponseSchema = paginated(OtxPulseSchema);
