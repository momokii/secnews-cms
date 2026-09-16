import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "../../lib/db.js";
import {
  DEFAULT_EMAIL_HTML,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_TEMPLATE_NAME,
} from "./render.js";
import { EmailTemplateSchema, PutEmailTemplateBodySchema } from "./schema.js";

/**
 * Surface 8b — org-wide HTML email template, the EMAIL-channel counterpart of
 * the bulletin template (routes 49-50). Single row name="default"; until an
 * ADMIN stores one, GET serves the built-in default. Rendering happens in
 * render.ts at delivery time, not here.
 */
export default async function emailTemplateRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  // GET /email-template — ANY authenticated role (send-dialog context).
  f.get(
    "/",
    {
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
      schema: { response: { 200: EmailTemplateSchema } },
    },
    async () => {
      const row = await prisma.emailTemplate.findUnique({
        where: { name: DEFAULT_EMAIL_TEMPLATE_NAME },
      });
      return {
        subject: row?.subject ?? DEFAULT_EMAIL_SUBJECT,
        htmlBody: row?.htmlBody ?? DEFAULT_EMAIL_HTML,
        updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
      };
    },
  );

  // PUT /email-template — ADMIN-only upsert of the default row.
  f.put(
    "/",
    {
      onRequest: [app.requireRole("ADMIN")],
      schema: {
        body: PutEmailTemplateBodySchema,
        response: { 200: EmailTemplateSchema },
      },
    },
    async (request) => {
      const row = await prisma.emailTemplate.upsert({
        where: { name: DEFAULT_EMAIL_TEMPLATE_NAME },
        update: { subject: request.body.subject, htmlBody: request.body.htmlBody },
        create: {
          name: DEFAULT_EMAIL_TEMPLATE_NAME,
          subject: request.body.subject,
          htmlBody: request.body.htmlBody,
        },
      });
      return {
        subject: row.subject,
        htmlBody: row.htmlBody,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  );
}
