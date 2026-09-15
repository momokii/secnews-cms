import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PromptKind } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/db.js";
import { DEFAULT_PROMPTS, PROMPT_PLACEHOLDERS } from "../ai/prompt-template.js";
import {
  ListPromptsResponseSchema,
  PutPromptBodySchema,
  PutPromptParamsSchema,
  PromptTemplateSchema,
  type PromptTemplate,
} from "./schema.js";

/**
 * Surface 4b — ADMIN-managed AI prompt templates (TASK-PROMPT). Mirrors the
 * bulletin-template pattern: GET serves the stored row or the built-in
 * default; PUT is an ADMIN-only upsert with a non-empty guard. The legend
 * documents exactly which ticket data the AI engine injects per placeholder
 * (see src/modules/ai/prompt-template.ts).
 */
export default async function promptRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  const KINDS = [PromptKind.FILL, PromptKind.ENRICH] as const;
  const placeholders = PROMPT_PLACEHOLDERS.map((placeholder) => ({ ...placeholder }));

  // GET /prompts — ANY authenticated role (template-editing context).
  f.get(
    "/",
    {
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
      schema: { response: { 200: ListPromptsResponseSchema } },
    },
    async () => {
      const rows = await prisma.promptTemplate.findMany();
      const byKind = new Map(rows.map((row) => [row.kind, row] as const));
      return KINDS.map((kind): PromptTemplate => {
        const row = byKind.get(kind);
        return {
          kind,
          content: row?.content ?? DEFAULT_PROMPTS[kind],
          updatedAt: row === undefined ? null : row.updatedAt.toISOString(),
          placeholders,
        };
      });
    },
  );

  // PUT /prompts/:kind — ADMIN-only upsert of the per-kind template row.
  f.put(
    "/:kind",
    {
      onRequest: [app.requireRole("ADMIN")],
      schema: {
        params: PutPromptParamsSchema,
        body: PutPromptBodySchema,
        response: { 200: PromptTemplateSchema },
      },
    },
    async (request) => {
      const row = await prisma.promptTemplate.upsert({
        where: { kind: request.params.kind },
        update: { content: request.body.content },
        create: { kind: request.params.kind, content: request.body.content },
      });
      return {
        kind: row.kind,
        content: row.content,
        updatedAt: row.updatedAt.toISOString(),
        placeholders,
      };
    },
  );
}
