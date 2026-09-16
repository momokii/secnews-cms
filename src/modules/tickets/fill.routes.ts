import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { PromptKind } from "../../generated/prisma/enums.js";
import { AppError } from "../../common/errors.js";
import { idParam } from "../../common/pagination.js";
import { AiFillResponseSchema } from "../ai/schema.js";
import { recordActivity } from "./activity.js";
import { generateSuggestions, SemanticError, storeSuggestions, toSuggestion } from "../ai/service.js";

/**
 * AI assist endpoints (Surface 4, #32/#33). Ticket content is the only
 * mandatory input; the body may optionally pick a provider and/or model —
 * omitted values fall back to the first configured provider (OPENAI →
 * ANTHROPIC → GEMINI → DEEPSEEK) and its configured/default model. An
 * explicit provider without a key is a 422, never a silent fallback. Results
 * land ONLY as PENDING AiSuggestion rows (carrying provider + model) — final
 * fields are touched later by suggestion accept (SUG-01), never here.
 */

const fillBody = z
  .object({
    provider: z.enum(["OPENAI", "ANTHROPIC", "GEMINI", "DEEPSEEK"]).optional(),
    model: z.string().min(1).optional(),
  })
  .strict();

/** Render a SemanticError as the documented 422 VALIDATION envelope — the
 * shared AI rejection path for every AI assist route. */
export function semantic422(reply: FastifyReply, error: SemanticError): void {
  void reply.code(422).send({
    error: { code: "VALIDATION", message: error.message, details: error.details ?? null },
  });
}

export default async function fillRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  const run = async (input: {
    ticketId: string;
    mode: "fill" | "enrich";
    actorId: string;
    reply: FastifyReply;
    body: { provider?: "OPENAI" | "ANTHROPIC" | "GEMINI" | "DEEPSEEK" | undefined; model?: string | undefined };
  }) => {
    const { ticketId, mode, actorId, reply, body } = input;
    const ticket = await app.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { iocs: true, sources: true },
    });
    if (ticket === null) {
      throw new AppError("NOT_FOUND", "Ticket not found");
    }
    const explicit = {
      ...(body.provider === undefined ? {} : { provider: body.provider }),
      ...(body.model === undefined ? {} : { model: body.model }),
    };
    let rows;
    try {
      const drafts = await generateSuggestions(app.prisma, ticket, mode, explicit);
      rows =
        drafts.length > 0
          ? await storeSuggestions(app.prisma, ticketId, drafts, mode === "fill" ? PromptKind.FILL : PromptKind.ENRICH)
          : [];
    } catch (error) {
      if (error instanceof SemanticError) {
        semantic422(reply, error);
        return reply;
      }
      throw error;
    }
    await recordActivity(app.prisma, {
      ticketId,
      actorId,
      action: mode === "fill" ? "AI_FILL" : "AI_ENRICH",
      detail: `${rows.length} suggestion(s)`,
    });
    return { suggestions: rows.map(toSuggestion) };
  };

  f.post("/:id/ai/fill", {
    onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    schema: {
      params: idParam,
      body: fillBody,
      response: { 200: AiFillResponseSchema },
    },
  }, async (request, reply) =>
    run({
      ticketId: request.params.id,
      mode: "fill",
      actorId: request.user.sub,
      reply,
      body: request.body,
    }),
  );

  f.post("/:id/ai/enrich", {
    onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    schema: {
      params: idParam,
      body: fillBody,
      response: { 200: AiFillResponseSchema },
    },
  }, async (request, reply) =>
    run({
      ticketId: request.params.id,
      mode: "enrich",
      actorId: request.user.sub,
      reply,
      body: request.body,
    }),
  );
}
