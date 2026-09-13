import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { AppError } from "../../common/errors.js";
import { idParam } from "../../common/pagination.js";
import { AiFillResponseSchema } from "../ai/schema.js";
import { generateSuggestions, SemanticError, storeSuggestions, toSuggestion } from "../ai/service.js";

/**
 * AI assist endpoints (Surface 4, #32/#33). Both accept empty bodies: every
 * input comes from the ticket, provider/model from central config. Results
 * land ONLY as PENDING AiSuggestion rows — final fields are touched later by
 * suggestion accept (SUG-01), never here.
 */

const emptyBody = z.object({}).strict();

function semantic422(reply: FastifyReply, error: SemanticError): void {
  void reply.code(422).send({
    error: { code: "VALIDATION", message: error.message, details: error.details ?? null },
  });
}

export default async function fillRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  const run = async (ticketId: string, mode: "fill" | "enrich", reply: FastifyReply) => {
    const ticket = await app.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { iocs: true, sources: true },
    });
    if (ticket === null) {
      throw new AppError("NOT_FOUND", "Ticket not found");
    }
    let rows;
    try {
      const drafts = await generateSuggestions(app.prisma, ticket, mode);
      rows = drafts.length > 0 ? await storeSuggestions(app.prisma, ticketId, drafts) : [];
    } catch (error) {
      if (error instanceof SemanticError) {
        semantic422(reply, error);
        return reply;
      }
      throw error;
    }
    return { suggestions: rows.map(toSuggestion) };
  };

  f.post("/:id/ai/fill", {
    onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    schema: {
      params: idParam,
      body: emptyBody,
      response: { 200: AiFillResponseSchema },
    },
  }, async (request, reply) => run(request.params.id, "fill", reply));

  f.post("/:id/ai/enrich", {
    onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    schema: {
      params: idParam,
      body: emptyBody,
      response: { 200: AiFillResponseSchema },
    },
  }, async (request, reply) => run(request.params.id, "enrich", reply));
}
