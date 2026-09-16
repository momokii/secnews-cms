import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "../../common/errors.js";
import { idParam } from "../../common/pagination.js";
import { AiFillResponseSchema, SourceDraftBodySchema } from "../ai/schema.js";
import { generateSourceDraftSuggestions } from "../ai/source-draft.js";
import { SemanticError, storeSuggestions, toSuggestion } from "../ai/service.js";
import { recordActivity } from "./activity.js";
import { semantic422 } from "./fill.routes.js";

/**
 * Surface 4, #33b — source-grounded drafting (TASK-SRC-DRAFT). The analyst
 * picks 1-20 ticket sources as the ONLY permitted grounding evidence and a
 * subset of overview/description/recommendations/references to draft. A
 * sourceId that does not belong to the ticket is 404; an empty targetFields
 * list is 400 (schema). Results land ONLY as PENDING AiSuggestion rows
 * carrying the resolved provider + model — final fields are touched later by
 * suggestion accept, never here.
 */
export default async function sourceDraftRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/:id/ai/source-draft",
    {
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
      schema: {
        params: idParam,
        body: SourceDraftBodySchema,
        response: { 200: AiFillResponseSchema },
      },
    },
    async (request, reply) => {
      const ticketId = request.params.id;
      const body = request.body;
      const ticket = await app.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { iocs: true, sources: true },
      });
      if (ticket === null) {
        throw new AppError("NOT_FOUND", "Ticket not found");
      }
      const sourceIds = [...new Set(body.sourceIds)];
      const known = new Set(ticket.sources.map((source) => source.id));
      const unknown = sourceIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new AppError("NOT_FOUND", `Source(s) not found on ticket ${ticketId}: ${unknown.join(", ")}`);
      }
      const explicit = {
        ...(body.provider === undefined ? {} : { provider: body.provider }),
        ...(body.model === undefined ? {} : { model: body.model }),
      };
      let rows;
      try {
        const drafts = await generateSourceDraftSuggestions(app.prisma, ticket, {
          sourceIds,
          targetFields: body.targetFields,
          allowWebSearch: body.allowWebSearch ?? false,
          explicit,
        });
        rows = drafts.length > 0 ? await storeSuggestions(app.prisma, ticketId, drafts) : [];
      } catch (error) {
        if (error instanceof SemanticError) {
          semantic422(reply, error);
          return reply;
        }
        throw error;
      }
      await recordActivity(app.prisma, {
        ticketId,
        actorId: request.user.sub,
        action: "AI_SOURCE_DRAFT",
        detail: `${rows.length} suggestion(s) from ${sourceIds.length} source(s)`,
      });
      return { suggestions: rows.map(toSuggestion) };
    },
  );
}
