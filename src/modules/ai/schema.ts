import { z } from "zod/v4";
import { paginated, pageQuery } from "../../common/pagination.js";
import { SuggestionStatusEnum } from "../tickets/schema.js";

/** AI assist. fill = strict (suggests ONLY missing final fields);
 * enrich = full rewrite suggestions. Both land as PENDING suggestions that
 * must be accepted/edited/rejected before Send or OTX push (hard block, S2).
 * Ids are uuid strings — every model PK is a uuid in the B1 Prisma schema. */

export const AiSuggestionSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  /** Final-field path the suggestion targets: overview | description |
   * recommendations | references | cveIds | affectedVersions | mitigation. */
  field: z.string().min(1),
  currentValue: z.string().nullable(),
  suggestedValue: z.string(),
  status: SuggestionStatusEnum,
  /** Model id that produced the suggestion (null for hand-written rows). */
  model: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AiSuggestion = z.infer<typeof AiSuggestionSchema>;

// POST /tickets/:id/ai/fill and POST /tickets/:id/ai/enrich (empty bodies —
// all inputs come from the ticket itself; provider/model from central config)
export const AiFillResponseSchema = z.object({
  suggestions: z.array(AiSuggestionSchema),
});

// POST /tickets/:id/suggestions/:suggestionId/accept — merges into final fields
export const SuggestionActionResponseSchema = z.object({
  suggestion: AiSuggestionSchema,
});

// GET /tickets/:id/suggestions
export const ListSuggestionsQuerySchema = pageQuery.extend({
  status: SuggestionStatusEnum.optional(),
});
export const ListSuggestionsResponseSchema = paginated(AiSuggestionSchema);
