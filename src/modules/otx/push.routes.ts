import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { AppError } from "../../common/errors.js";
import { decryptSecret } from "../../lib/crypto.js";
import { assertNoPendingSuggestions } from "../../lib/guards/pending.js";
import { createPulse, publicAllowed, toOtxMarking, updatePulse } from "../../lib/otx/client.js";
import { prisma } from "../../lib/db.js";
import { PushOtxResponseSchema } from "./schema.js";
import { recordActivity } from "../tickets/activity.js";

/**
 * Route 52 — lives in otx/ but serves the contract's POST /tickets/:id/otx
 * (MGR). Guards mirror send: ticket READY (422 VALIDATION) and zero PENDING
 * suggestions (409 PENDING_SUGGESTIONS, S2). Indicators are the included IOCs
 * pushed as typed {indicator,type} objects (client maps IocType → OTX type
 * names); the client maps TLP to the lowercase legacy value and forces
 * public=false for AMBER/RED. Idempotent: a ticket that already carries an
 * otxPulseId is PATCHed upstream instead of creating a second pulse, and the
 * activity trail marks the entry "(updated)". Result: otxPulseId/otxPulseUrl
 * stored on the ticket (S5).
 */
export const prefixOverride = "/tickets";

const emptyBody = z.object({}).strict();

export default async function otxPushRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/:id/otx",
    {
      onRequest: [app.requireRole("ADMIN", "EDITOR")],
      schema: {
        params: z.object({ id: z.uuid() }),
        body: emptyBody,
        response: { 200: PushOtxResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        include: { iocs: { where: { includeInBulletin: true } } },
      });
      if (ticket === null) {
        throw new AppError("NOT_FOUND", `Ticket ${id} not found`);
      }
      if (ticket.status !== "READY") {
        throw new AppError("VALIDATION", `Ticket must be READY to push to OTX (currently ${ticket.status})`, undefined, 422);
      }
      await assertNoPendingSuggestions(prisma, id);

      const row = await prisma.integrationConfig.findUnique({ where: { kind: "OTX" } });
      if (row === null) {
        throw new AppError("VALIDATION", "No OTX key configured — set it under integrations first", undefined, 422);
      }
      const { apiKey } = JSON.parse(decryptSecret(row.encryptedKey)) as { apiKey: string };

      const description = [ticket.overview, ticket.description]
        .filter((field) => field !== null && field.trim() !== "")
        .join("\n\n");
      const pulseInput = {
        apiKey,
        name: ticket.title,
        description: description === "" ? ticket.title : description,
        tlp: ticket.tlp,
        tags: ["secnews", `TLP:${ticket.tlp}`],
        references: ticket.references,
        indicators: ticket.iocs.map((ioc) => ({ type: ioc.type, value: ioc.value })),
      };
      const existingPulseId = ticket.otxPulseId;
      const pulse =
        existingPulseId !== null
          ? await updatePulse(existingPulseId, pulseInput)
          : await createPulse(pulseInput);

      await prisma.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id },
          data: { otxPulseId: pulse.id, otxPulseUrl: pulse.url },
        });
        await recordActivity(tx, {
          ticketId: id,
          actorId: request.user.sub,
          action: "OTX_PUSHED",
          detail: existingPulseId !== null ? `${pulse.id} (updated)` : pulse.id,
        });
      });
      return {
        pulseId: pulse.id,
        pulseUrl: pulse.url,
        isPublic: publicAllowed(ticket.tlp),
        tlpMarking: toOtxMarking(ticket.tlp),
      };
    },
  );
}
