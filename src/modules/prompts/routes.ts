import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PromptKind } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/db.js";
import { pageQuery } from "../../common/pagination.js";
import { DEFAULT_PROMPTS, PROMPT_PLACEHOLDERS } from "../ai/prompt-template.js";
import {
  ListPromptsResponseSchema,
  PutPromptBodySchema,
  PutPromptParamsSchema,
  PromptTemplateSchema,
  ListPromptRevisionsResponseSchema,
  type PromptTemplate,
} from "./schema.js";

/**
 * Surface 4b — ADMIN-managed AI prompt templates and append-only revisions.
 * Mirrors the
 * bulletin-template pattern: GET serves the stored row or the built-in
 * default; PUT is an ADMIN-only upsert with a non-empty guard. The legend
 * documents exactly which ticket data the AI engine injects per placeholder
 * (see src/modules/ai/prompt-template.ts).
 */
export default async function promptRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  const KINDS = [PromptKind.FILL, PromptKind.ENRICH, PromptKind.SOURCE_DRAFT] as const;
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
      const row = await prisma.$transaction(async (tx) => {
        const row = await tx.promptTemplate.upsert({
          where: { kind: request.params.kind },
          update: { content: request.body.content },
          create: { kind: request.params.kind, content: request.body.content },
        });
        await tx.promptRevision.create({
          data: { promptKind: row.kind, content: row.content, actorId: request.user.sub },
        });
        return row;
      });
      return {
        kind: row.kind,
        content: row.content,
        updatedAt: row.updatedAt.toISOString(),
        placeholders,
      };
    },
  );

  f.get(
    "/:kind/history",
    {
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
      schema: {
        params: PutPromptParamsSchema,
        querystring: pageQuery,
        response: { 200: ListPromptRevisionsResponseSchema },
      },
    },
    async (request) => {
      const { page, pageSize } = request.query;
      const where = { promptKind: request.params.kind };
      const [rows, total] = await prisma.$transaction([
        prisma.promptRevision.findMany({
          where,
          include: { actor: { select: { name: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.promptRevision.count({ where }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          promptKind: row.promptKind,
          content: row.content,
          actorId: row.actorId,
          actorName: row.actor?.name ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      };
    },
  );
}
