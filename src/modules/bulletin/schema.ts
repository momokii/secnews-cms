import { z } from "zod/v4";

/** Client-facing bulletin output. Template is org-wide with placeholders;
 * preview renders the exact message body (defanged IOCs included) that a
 * sender would deliver. Missing required final fields → 422 VALIDATION. */

/** Placeholders: {{title}} {{overview}} {{description}} {{ioc_block}}
 * {{recommendations}} {{references}}. Unfilled optional sections are dropped
 * by the renderer, never fabricated. */
export const BulletinTemplateSchema = z.object({
  template: z.string().min(1),
});
export type BulletinTemplate = z.infer<typeof BulletinTemplateSchema>;

// PUT /bulletin/template
export const PutTemplateBodySchema = BulletinTemplateSchema;

// POST /tickets/:id/bulletin/preview
export const PreviewResponseSchema = z.object({
  rendered: z.string(),
});
