import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { AppError } from "../../common/errors.js";
import { decryptSecret, encryptSecret, maskKey } from "../../lib/crypto.js";
import type { IntegrationKind } from "../../generated/prisma/enums.js";
import { callAnthropic } from "../ai/providers/anthropic.js";
import { callDeepSeek } from "../ai/providers/deepseek.js";
import { callGemini } from "../ai/providers/gemini.js";
import { callOpenAi } from "../ai/providers/openai.js";
import { DEFAULT_MODELS, type ChatCompletionOptions, type ChatProviderFn, type FetchLike } from "../ai/providers/types.js";
import {
  AvailableIntegrationSchema,
  IntegrationConfigResponseSchema,
  IntegrationKindEnum,
  PutIntegrationConfigBodySchema,
  PutOtxConfigBodySchema,
  TestConnectionResponseSchema,
  type IntegrationConfigResponse,
} from "./schema.js";

/**
 * Central integration credentials (AI providers + OTX), ADMIN-only.
 * Keys are AES-256-GCM encrypted at rest (blob also carries the optional
 * model) and NEVER serialized: responses expose maskedKey + hasKey (INT-01).
 */

const kindParam = z.object({ kind: IntegrationKindEnum });
const testBody = z.object({}).strict();
/** Unconfigured kinds still satisfy the response schema. */
const EPOCH = "1970-01-01T00:00:00.000Z";
const OTX_BASE = "https://otx.alienvault.com";
/** Probe path: the same subscribed-pulses endpoint the app itself uses (OTX has no /subscriber/mine). */
const OTX_TEST_PATH = "/api/v1/pulses/subscribed?limit=1";

type StoredConfig = { apiKey: string; model?: string };

/** Render a semantic rejection as the 422 VALIDATION envelope (contract §Errors). */
function send422(reply: FastifyReply, message: string): void {
  void reply.code(422).send({ error: { code: "VALIDATION", message, details: null } });
}

type AiKind = "OPENAI" | "ANTHROPIC" | "GEMINI" | "DEEPSEEK";

const AI_CALLERS: Partial<Record<AiKind, ChatProviderFn>> = {
  OPENAI: callOpenAi,
  ANTHROPIC: callAnthropic,
  GEMINI: callGemini,
  DEEPSEEK: callDeepSeek,
};

function toResponse(kind: IntegrationKind, row: { encryptedKey: string; updatedAt: Date } | null): IntegrationConfigResponse {
  if (row === null) {
    return { kind, model: null, hasKey: false, maskedKey: null, updatedAt: EPOCH };
  }
  const config = JSON.parse(decryptSecret(row.encryptedKey)) as StoredConfig;
  return {
    kind,
    model: config.model ?? null,
    hasKey: true,
    maskedKey: maskKey(config.apiKey),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function storedKey(app: FastifyInstance, kind: IntegrationKind): Promise<StoredConfig | null> {
  const row = await app.prisma.integrationConfig.findUnique({ where: { kind } });
  if (row === null) {
    return null;
  }
  return JSON.parse(decryptSecret(row.encryptedKey)) as StoredConfig;
}

export default async function integrationRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  // GET /integrations/available — WORK-readable dropdown info (kind, model,
  // hasKey) for every kind. Masked surface: no maskedKey, no key material.
  f.get("/available", {
    onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    schema: {
      response: { 200: z.array(AvailableIntegrationSchema) },
    },
  }, async () => {
    const kinds = IntegrationKindEnum.options;
    const rows = await app.prisma.integrationConfig.findMany({
      where: { kind: { in: [...kinds] } },
    });
    const byKind = new Map(rows.map((row) => [row.kind, row] as const));
    return kinds.map((kind) => {
      const row = byKind.get(kind);
      if (row === undefined) {
        return { kind, model: null, hasKey: false };
      }
      const config = JSON.parse(decryptSecret(row.encryptedKey)) as StoredConfig;
      return { kind, model: config.model ?? null, hasKey: true };
    });
  });

  // GET /integrations/:kind — masked view, never the plaintext key.
  f.get("/:kind", {
    onRequest: [app.requireRole("ADMIN")],
    schema: {
      params: kindParam,
      response: { 200: IntegrationConfigResponseSchema },
    },
  }, async (request) => {
    const { kind } = request.params;
    const row = await app.prisma.integrationConfig.findUnique({ where: { kind } });
    return toResponse(kind, row);
  });

  // PUT /integrations/:kind — upsert; OTX forbids model (422, semantic rule).
  f.put("/:kind", {
    onRequest: [app.requireRole("ADMIN")],
    schema: {
      params: kindParam,
      body: PutIntegrationConfigBodySchema,
      response: { 200: IntegrationConfigResponseSchema },
    },
  }, async (request, reply) => {
    const { kind } = request.params;
    if (kind === "OTX") {
      const parsed = PutOtxConfigBodySchema.safeParse(request.body);
      if (parsed.success === false) {
        throw new AppError("VALIDATION", "OTX configuration requires a non-empty apiKey", parsed.error.issues);
      }
      if (typeof request.body === "object" && request.body !== null && "model" in request.body) {
        send422(reply, "OTX configuration must not include a model");
        return reply;
      }
      const blob = encryptSecret(JSON.stringify(parsed.data));
      const row = await app.prisma.integrationConfig.upsert({
        where: { kind },
        update: { encryptedKey: blob },
        create: { kind, encryptedKey: blob },
      });
      return toResponse(kind, row);
    }
    const body = PutIntegrationConfigBodySchema.parse(request.body);
    const blob = encryptSecret(JSON.stringify(body));
    const row = await app.prisma.integrationConfig.upsert({
      where: { kind },
      update: { encryptedKey: blob },
      create: { kind, encryptedKey: blob },
    });
    return toResponse(kind, row);
  });

  // POST /integrations/:kind/test — upstream failures are ok:false, not HTTP errors.
  f.post("/:kind/test", {
    onRequest: [app.requireRole("ADMIN")],
    schema: {
      params: kindParam,
      body: testBody,
      response: { 200: TestConnectionResponseSchema },
    },
  }, async (request) => {
    const { kind } = request.params;
    const config = await storedKey(app, kind);
    if (config === null) {
      return { ok: false, detail: `no key configured for ${kind}` };
    }
    const startedAt = Date.now();
    if (kind === "OTX") {
      const doFetch: FetchLike = (url, init) => globalThis.fetch(url, init);
      try {
        const response = await doFetch(`${OTX_BASE}${OTX_TEST_PATH}`, {
          headers: { "X-OTX-API-KEY": config.apiKey },
        });
        return {
          ok: response.ok,
          detail: response.ok ? undefined : `otx request failed with upstream status ${response.status}`,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        return { ok: false, detail: `otx request failed: ${(error as Error).message}`, latencyMs: Date.now() - startedAt };
      }
    }
    const caller = AI_CALLERS[kind];
    if (caller === undefined) {
      return { ok: false, detail: `no test procedure for ${kind}` };
    }
    const options: ChatCompletionOptions = {
      apiKey: config.apiKey,
      model: config.model ?? DEFAULT_MODELS[kind],
      system: "You are a connectivity probe. Reply with the single word: pong.",
      prompt: "ping",
    };
    try {
      await caller(options);
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return { ok: false, detail: (error as Error).message, latencyMs: Date.now() - startedAt };
    }
  });
}
