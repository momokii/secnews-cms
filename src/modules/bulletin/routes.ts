import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "../../lib/db.js";
import { BulletinTemplateSchema, PutTemplateBodySchema } from "./schema.js";
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_NAME } from "./render.js";

/**
 * Surface 8a — org-wide bulletin template (routes 49–50). The template is a
 * placeholder document; rendering lives in render.ts. Stored as the single
 * BulletinTemplate row name="default" (body column); until an ADMIN stores
 * one, GET serves the built-in DEFAULT_TEMPLATE.
 */
export default async function bulletinRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  // GET /bulletin/template — ANY authenticated role (send-dialog context).
  f.get(
    "/template",
    {
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
      schema: { response: { 200: BulletinTemplateSchema } },
    },
    async () => {
      const row = await prisma.bulletinTemplate.findFirst({
        where: { name: DEFAULT_TEMPLATE_NAME, isActive: true },
        select: { body: true },
      });
      return { template: row?.body ?? DEFAULT_TEMPLATE };
    },
  );

  // PUT /bulletin/template — ADMIN-only upsert of the default row.
  f.put(
    "/template",
    {
      onRequest: [app.requireRole("ADMIN")],
      schema: {
        body: PutTemplateBodySchema,
        response: { 200: BulletinTemplateSchema },
      },
    },
    async (request) => {
      const row = await prisma.bulletinTemplate.upsert({
        where: { name: DEFAULT_TEMPLATE_NAME },
        update: { body: request.body.template, isActive: true },
        create: { name: DEFAULT_TEMPLATE_NAME, body: request.body.template },
      });
      return { template: row.body };
    },
  );
}
