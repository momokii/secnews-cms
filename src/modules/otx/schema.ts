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
  created: z.iso.datetime().nullable(),
  modified: z.iso.datetime().nullable(),
});
export type OtxPulse = z.infer<typeof OtxPulseSchema>;

// GET /otx/pulses — pageSize clamps into 1..50 (OTX's limit ceiling);
// `search` is the only source carrying q (upstream subscribed/my lack it).
export const ListPulsesQuerySchema = pageQuery.pick({ page: true }).extend({
  source: z.enum(["subscribed", "mine", "search"]).default("subscribed"),
  pageSize: z.coerce
    .number()
    .int()
    .default(20)
    .transform((size) => Math.min(50, Math.max(1, size))),
  q: z.string().trim().max(200).optional(),
});
export const ListPulsesResponseSchema = paginated(OtxPulseSchema);

// GET /otx/pulses/:id — OTX pulse ids are Mongo hex ids, not our uuids.
export const GetPulseParamsSchema = z.object({
  id: z.string().min(1).max(64),
});

export const OtxPulseIndicatorSchema = z.object({
  value: z.string(),
  type: z.string(),
});

/** Full pulse detail rendered by the web Details modal. */
export const OtxPulseDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isPublic: z.boolean(),
  tlp: OtxTlpEnum,
  tags: z.array(z.string()),
  references: z.array(z.string()),
  indicators: z.array(OtxPulseIndicatorSchema),
  created: z.iso.datetime().nullable(),
  modified: z.iso.datetime().nullable(),
});
export type OtxPulseDetail = z.infer<typeof OtxPulseDetailSchema>;
