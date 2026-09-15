import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { z } from "zod/v4";
import { AppError } from "../../common/errors.js";
import { upstream502, UpstreamError } from "../../common/upstream.js";
import type { ListPulsesInput, SubscribedPulse } from "../../lib/otx/read.js";
import { getPulse, listMyPulses, listSubscribed, searchPulses } from "../../lib/otx/read.js";
import { decryptSecret } from "../../lib/crypto.js";
import {
  GetPulseParamsSchema,
  ListPulsesQuerySchema,
  ListPulsesResponseSchema,
  OtxPulseDetailSchema,
} from "./schema.js";

/**
 * Route 53 — GET /otx/pulses (MGR + ANALYST read-only): subscribed / mine /
 * search proxy, pageSize clamped to the OTX limit ceiling of 50. Route 54 —
 * GET /otx/pulses/:id: full-pulse detail proxy; only pulses the configured
 * key can access answer 200, everything upstream rejects surfaces as 502.
 * The OTX key comes from central integration config, never the wire, and is
 * never echoed back. Upstream failure → 502 with the canonical error
 * envelope (contract §9). Push (POST /tickets/:id/otx) stays MGR-only.
 */

type PulseSource = z.infer<typeof ListPulsesQuerySchema>["source"];

async function readFeed(
  source: PulseSource,
  input: ListPulsesInput & { q?: string | undefined },
): Promise<{ total: number; pulses: SubscribedPulse[] }> {
  switch (source) {
    case "mine":
      return listMyPulses(input);
    case "search":
      return searchPulses({ ...input, q: input.q ?? "" });
    case "subscribed":
      return listSubscribed(input);
  }
}

async function loadOtxApiKey(app: FastifyInstance): Promise<string> {
  const row = await app.prisma.integrationConfig.findUnique({ where: { kind: "OTX" } });
  if (row === null) {
    throw new AppError("VALIDATION", "No OTX key configured — set it under integrations first", undefined, 422);
  }
  const { apiKey } = JSON.parse(decryptSecret(row.encryptedKey)) as { apiKey: string };
  return apiKey;
}

/** Render any upstream failure as the 502 envelope; UpstreamError contributes
 * the truncated body snippet in details for diagnosis (keys stay in headers). */
export function rethrowUpstreamFailure(error: unknown): never {
  if (error instanceof UpstreamError) {
    throw upstream502(error);
  }
  throw new AppError("INTERNAL", `OTX upstream request failed: ${(error as Error).message}`, undefined, 502);
}

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
      const apiKey = await loadOtxApiKey(app);
      const { page, pageSize, source, q } = request.query;
      const feed = await readFeed(source, { apiKey, page, pageSize, q }).catch(rethrowUpstreamFailure);
      return { items: feed.pulses, total: feed.total, page, pageSize };
    },
  );

  f.get(
    "/pulses/:id",
    {
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
      schema: {
        params: GetPulseParamsSchema,
        response: { 200: OtxPulseDetailSchema },
      },
    },
    async (request) => {
      const apiKey = await loadOtxApiKey(app);
      return getPulse({ apiKey, id: request.params.id }).catch(rethrowUpstreamFailure);
    },
  );
}
