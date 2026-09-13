import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { sendError } from "../../common/errors.js";
import { upsertFeedItem } from "../../lib/feeds/store.js";
import { prisma } from "../../lib/db.js";
import { toFeedItemWire } from "../feeds/map.js";
import { IngestBodySchema, IngestResponseSchema } from "./schema.js";

const PUSH_SOURCE_URL = "push://ingest/";

function pushSourceUrl(sourceName: string): string {
  return `${PUSH_SOURCE_URL}${encodeURIComponent(sourceName)}`;
}

/** Constant-time compare via sha256 digests, so unequal-length secrets are safe. */
function isApiKeyValid(provided: unknown): boolean {
  const expected = process.env["INGEST_API_KEY"];
  if (typeof provided !== "string" || provided === "" || expected === undefined || expected === "") {
    return false;
  }
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

/** Push-only sources have no feed url; the deterministic push:// url carries the
 * uniqueness. An existing source with the same name wins, so pushes can attach
 * to an already-managed feed. */
async function resolvePushSource(sourceName: string) {
  const existing = await prisma.feedSource.findFirst({ where: { name: sourceName } });
  if (existing !== null) {
    return existing;
  }
  try {
    return await prisma.feedSource.create({
      data: { name: sourceName, url: pushSourceUrl(sourceName) },
    });
  } catch (err) {
    const raced = await prisma.feedSource.findFirst({ where: { url: pushSourceUrl(sourceName) } });
    if (raced !== null) {
      return raced;
    }
    throw err;
  }
}

// Autoload prefixes the module directory, so "/" here resolves to POST /ingest.
export default async function ingestRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/",
    { schema: { body: IngestBodySchema, response: { 201: IngestResponseSchema } } },
    async (request, reply) => {
      if (!isApiKeyValid(request.headers["x-api-key"])) {
        return sendError(reply, "UNAUTHORIZED", "Missing or invalid X-API-Key");
      }
      const body = request.body;
      const source = await resolvePushSource(body.sourceName);
      const item = await upsertFeedItem({
        feedId: source.id,
        guid: body.link,
        title: body.title,
        url: body.link,
        publishedAt: new Date(body.publishedAt),
        raw: body.raw ?? body,
      });
      return reply.code(201).send({ item: toFeedItemWire({ ...item, ticket: null }) });
    },
  );
}
