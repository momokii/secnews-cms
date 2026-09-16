import { z } from "zod/v4";
import { EMAIL_PLACEHOLDERS } from "./render.js";

/** Wire schemas for the org-wide HTML email template. PUT validates subject
 * 5-200 chars, htmlBody 10-20000 chars, and requires at least one supported
 * placeholder so a template can never be stored in an unrenderable state. */

export const EmailTemplateSchema = z.object({
  subject: z.string(),
  htmlBody: z.string(),
  updatedAt: z.string(),
});
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

export const PutEmailTemplateBodySchema = z.object({
  subject: z.string().min(5).max(200),
  htmlBody: z
    .string()
    .min(10)
    .max(20000)
    .refine(
      (body) => EMAIL_PLACEHOLDERS.some((name) => body.includes(`{{${name}}}`)),
      {
        message: `htmlBody must contain at least one placeholder: ${EMAIL_PLACEHOLDERS.map(
          (name) => `{{${name}}}`,
        ).join(" ")}`,
      },
    ),
});
export type PutEmailTemplateBody = z.infer<typeof PutEmailTemplateBodySchema>;
