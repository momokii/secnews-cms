import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "../../common/errors.js";
import { listSubscribed } from "../../lib/otx/client.js";
import { decryptSecret } from "../../lib/crypto.js";
import { ListPulsesQuerySchema, ListPulsesResponseSchema } from "./schema.js";

/**
 * Route 53 — GET /otx/pulses (MGR + ANALYST read-only). Proxies the OTX
 * subscribed feed page by page; the OTX key comes from central integration
 * config, never the wire. Upstream failure → 502 with the canonical error
 * envelope (contract §9). Push (POST /tickets/:id/otx) stays MGR-only.
 */

const PROXY_PAGE_SIZE = 20;

export default async function otxRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/pulses",
    {
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
      schema: {
        querystring: ListPulsesQuerySchema,
        response: { 200: ListPulsesResponseSchema },
      },
    },
    async (request) => {
      const row = await app.prisma.integrationConfig.findUnique({ where: { kind: "OTX" } });
      if (row === null) {
        throw new AppError("VALIDATION", "No OTX key configured — set it under integrations first", undefined, 422);
      }
      const { apiKey } = JSON.parse(decryptSecret(row.encryptedKey)) as { apiKey: string };
      const { page } = request.query;
      const feed = await listSubscribed({ apiKey, page }).catch((error: unknown) => {
        throw new AppError(
          "INTERNAL",
          `OTX upstream request failed: ${(error as Error).message}`,
          undefined,
          502,
        );
      });
      return { items: feed.pulses, total: feed.total, page, pageSize: PROXY_PAGE_SIZE };
    },
  );
}
