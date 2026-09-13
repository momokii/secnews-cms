import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { AppError } from "../../common/errors.js";
import { idParam } from "../../common/pagination.js";
import { prisma } from "../../lib/db.js";
import { PreviewResponseSchema } from "./schema.js";
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_NAME, missingPreviewFields, renderBulletin } from "./render.js";

/**
 * Route 51 — lives in bulletin/ but serves the contract's
 * /tickets/:id/bulletin/preview. Preview renders the exact defanged body a
 * sender would deliver; missing required final fields → 422 VALIDATION
 * (PREV-02). No status gate: preview is allowed while authoring.
 */
export const prefixOverride = "/tickets";

const emptyBody = z.object({}).strict();

export default async function bulletinPreviewRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/:id/bulletin/preview",
    {
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
      schema: {
        params: idParam,
        body: emptyBody,
        response: { 200: PreviewResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        include: { iocs: { orderBy: { createdAt: "asc" } } },
      });
      if (ticket === null) {
        throw new AppError("NOT_FOUND", `Ticket ${id} not found`);
      }
      const data = {
        title: ticket.title,
        overview: ticket.overview,
        description: ticket.description,
        recommendations: ticket.recommendations,
        references: ticket.references,
        iocs: ticket.iocs.filter((ioc) => ioc.includeInBulletin),
      };
      const missing = missingPreviewFields(data);
      if (missing.length > 0) {
        throw new AppError(
          "VALIDATION",
          `Bulletin preview requires filled final fields — missing: ${missing.join(", ")}`,
          { missing },
          422,
        );
      }
      const templateRow = await prisma.bulletinTemplate.findFirst({
        where: { name: DEFAULT_TEMPLATE_NAME, isActive: true },
        select: { body: true },
      });
      return { rendered: renderBulletin(templateRow?.body ?? DEFAULT_TEMPLATE, data) };
    },
  );
}
