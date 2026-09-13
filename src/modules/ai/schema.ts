import { z } from "zod/v4";
import { paginated, pageQuery } from "../../common/pagination.js";
import { SuggestionStatusEnum } from "../tickets/schema.js";

/** AI assist. fill = strict (suggests ONLY missing final fields);
 * enrich = full rewrite suggestions. Both land as PENDING suggestions that
 * must be accepted/edited/rejected before Send or OTX push (hard block, S2). */

export const AiSuggestionSchema = z.object({
  id: z.number().int().positive(),
  ticketId: z.number().int().positive(),
  /** Final-field path the suggestion targets: overview | description |
   * recommendations | references | cveIds | affectedVersions | mitigation. */
  field: z.string().min(1),
  currentValue: z.string().nullable(),
  suggestedValue: z.string(),
  status: SuggestionStatusEnum,
  createdById: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
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
