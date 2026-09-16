import { z } from "zod/v4";

/**
 * TASK-PROMPT — client-facing prompt-template surface. Two ADMIN-managed
 * templates (kind FILL / ENRICH, one row each); GET also serves the
 * placeholder legend so editors know which variables the AI engine injects.
 * A missing row is served as the built-in default with `updatedAt: null`
 * (never edited) — mirrors the bulletin-template behavior.
 */

export const PromptKindSchema = z.enum(["FILL", "ENRICH", "SOURCE_DRAFT"]);
export type PromptKindValue = z.infer<typeof PromptKindSchema>;

export const PromptPlaceholderSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

export const PromptTemplateSchema = z.object({
  kind: PromptKindSchema,
  content: z.string(),
  /** Null when the built-in default is served (no stored row yet). */
  updatedAt: z.iso.datetime().nullable(),
  placeholders: z.array(PromptPlaceholderSchema),
});
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

// GET /prompts
export const ListPromptsResponseSchema = z.array(PromptTemplateSchema);

// PUT /prompts/:kind
export const PutPromptParamsSchema = z.object({ kind: PromptKindSchema });
export const PutPromptBodySchema = z.object({ content: z.string().min(1) }).strict();

export const PromptRevisionSchema = z.object({
  id: z.uuid(),
  promptKind: PromptKindSchema,
  content: z.string(),
  actorId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const ListPromptRevisionsResponseSchema = z.object({
  items: z.array(PromptRevisionSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
