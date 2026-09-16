import { z } from "zod/v4";
import { paginated, pageQuery } from "../../common/pagination.js";
import { PromptKind } from "../../generated/prisma/enums.js";
import { SuggestionStatusEnum } from "../tickets/schema.js";
import { SOURCE_DRAFT_FIELDS } from "./prompts.js";

/** AI assist. fill = strict (suggests ONLY missing final fields);
 * enrich = full rewrite suggestions. Both land as PENDING suggestions that
 * must be accepted/edited/rejected before Send or OTX push (hard block, S2).
 * Ids are uuid strings — every model PK is a uuid in the B1 Prisma schema. */

export const PromptKindEnum = z.enum(PromptKind);
export type PromptKindValue = z.infer<typeof PromptKindEnum>;

export const AiSuggestionSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  /** Final-field path the suggestion targets: overview | description |
   * recommendations | references | cveIds | affectedVersions | mitigation. */
  field: z.string().min(1),
  currentValue: z.string().nullable(),
  suggestedValue: z.string(),
  status: SuggestionStatusEnum,
  /** AI flow that produced the row: FILL | ENRICH | SOURCE_DRAFT — lets each
   * ticket detail panel list only its own suggestions. */
  origin: PromptKindEnum,
  /** Model id that produced the suggestion (null for hand-written rows). */
  model: z.string().nullable(),
  /** Provider kind (OPENAI|ANTHROPIC|GEMINI|DEEPSEEK) that produced the
   * suggestion (null for hand-written rows). */
  provider: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AiSuggestion = z.infer<typeof AiSuggestionSchema>;

// POST /tickets/:id/ai/fill and POST /tickets/:id/ai/enrich (empty bodies —
// all inputs come from the ticket itself; provider/model from central config)
export const AiFillResponseSchema = z.object({
  suggestions: z.array(AiSuggestionSchema),
});

// POST /tickets/:id/ai/source-draft (TASK-SRC-DRAFT): the analyst picks the
// grounding sources and the narrative fields to draft. Only overview/
// description/recommendations/references are draftable here — the typed
// working fields (cveIds etc.) belong to fill/enrich.
export const SourceDraftBodySchema = z
  .object({
    sourceIds: z.array(z.uuid()).min(1).max(20),
    targetFields: z.array(z.enum(SOURCE_DRAFT_FIELDS)).min(1),
    /** Prompt-only augmentation for references; no server-side fetching. */
    allowWebSearch: z.boolean().optional(),
    provider: z.enum(["OPENAI", "ANTHROPIC", "GEMINI", "DEEPSEEK"]).optional(),
    model: z.string().min(1).optional(),
  })
  .strict();

// POST /tickets/:id/suggestions/:suggestionId/accept — merges into final fields
export const SuggestionActionResponseSchema = z.object({
  suggestion: AiSuggestionSchema,
});

// GET /tickets/:id/suggestions — origin is a comma-separated list
// (e.g. FILL,ENRICH for the assist panel, SOURCE_DRAFT for source draft);
// omitted = every origin (backward compatible).
export const ListSuggestionsQuerySchema = pageQuery.extend({
  status: SuggestionStatusEnum.optional(),
  origin: z
    .string()
    .optional()
    .transform((raw) => (raw === undefined ? undefined : raw.split(",").map((entry) => entry.trim())))
    .pipe(z.array(PromptKindEnum).min(1))
    .optional(),
});
export const ListSuggestionsResponseSchema = paginated(AiSuggestionSchema);
