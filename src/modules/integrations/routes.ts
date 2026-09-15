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
  PutAnyIntegrationBodySchema,
  PutIntegrationConfigBodySchema,
  PutOtxConfigBodySchema,
  PutSmtpConfigBodySchema,
  PutWahaConfigBodySchema,
  TestConnectionResponseSchema,
  type AiStoredConfig,
  type IntegrationConfigResponse,
  type SmtpStoredConfig,
  type WahaStoredConfig,
} from "./schema.js";
import { loadStoredConfig } from "./config-store.js";
import { probeSmtp, probeWaha } from "./probes.js";

/**
 * Central integration credentials (AI providers + OTX + SMTP + WAHA), ADMIN-only.
 * Every kind stores ONE AES-256-GCM encrypted JSON blob and NEVER serializes
 * secrets: responses expose maskedKey + hasKey plus the kind's non-secret
 * coordinates (INT-01).
 */

const kindParam = z.object({ kind: IntegrationKindEnum });
const testBody = z.object({}).strict();
/** Unconfigured kinds still satisfy the response schema. */
const EPOCH = "1970-01-01T00:00:00.000Z";
const OTX_BASE = "https://otx.alienvault.com";
/** Probe path: the same subscribed-pulses endpoint the app itself uses (OTX has no /subscriber/mine). */
const OTX_TEST_PATH = "/api/v1/pulses/subscribed?limit=1";

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

const EMPTY_RESPONSE: Omit<IntegrationConfigResponse, "kind" | "updatedAt"> = {
  model: null,
  hasKey: false,
  maskedKey: null,
  host: null,
  port: null,
  from: null,
  secure: null,
  baseUrl: null,
  session: null,
};

function toResponse(kind: IntegrationKind, row: { encryptedKey: string; updatedAt: Date } | null): IntegrationConfigResponse {
  if (row === null) {
    return { kind, ...EMPTY_RESPONSE, updatedAt: EPOCH };
  }
  const config: unknown = JSON.parse(decryptSecret(row.encryptedKey));
  const updatedAt = row.updatedAt.toISOString();
  if (kind === "SMTP") {
    const smtp = config as SmtpStoredConfig;
    return {
      kind,
      ...EMPTY_RESPONSE,
      hasKey: true,
      maskedKey: maskKey(smtp.password),
      host: smtp.host,
      port: smtp.port,
      from: smtp.from,
      secure: smtp.secure ?? smtp.port === 465,
      updatedAt,
    };
  }
  if (kind === "WAHA") {
    const waha = config as WahaStoredConfig;
    return {
      kind,
      ...EMPTY_RESPONSE,
      hasKey: true,
      maskedKey: waha.apiKey === undefined ? null : maskKey(waha.apiKey),
      baseUrl: waha.baseUrl,
      session: waha.session,
      updatedAt,
    };
  }
  const ai = config as AiStoredConfig;
  return { kind, ...EMPTY_RESPONSE, hasKey: true, model: ai.model ?? null, maskedKey: maskKey(ai.apiKey), updatedAt };
}

/** Upsert one kind's config blob and answer the masked view. */
async function storeConfig(app: FastifyInstance, kind: IntegrationKind, blob: string): Promise<IntegrationConfigResponse> {
  const row = await app.prisma.integrationConfig.upsert({
    where: { kind },
    update: { encryptedKey: blob },
    create: { kind, encryptedKey: blob },
  });
  return toResponse(kind, row);
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
      const config = JSON.parse(decryptSecret(row.encryptedKey)) as AiStoredConfig;
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

  // PUT /integrations/:kind — upsert; the blob shape branches on the kind.
  f.put("/:kind", {
    onRequest: [app.requireRole("ADMIN")],
    schema: {
      params: kindParam,
      body: PutAnyIntegrationBodySchema,
      response: { 200: IntegrationConfigResponseSchema },
    },
  }, async (request, reply) => {
    const { kind } = request.params;
    if (kind === "SMTP" || kind === "WAHA") {
      const parsed = (kind === "SMTP" ? PutSmtpConfigBodySchema : PutWahaConfigBodySchema).safeParse(request.body);
      if (parsed.success === false) {
        throw new AppError("VALIDATION", `${kind} configuration is incomplete`, parsed.error.issues);
      }
      return storeConfig(app, kind, encryptSecret(JSON.stringify(parsed.data)));
    }
    if (kind === "OTX") {
      const parsed = PutOtxConfigBodySchema.safeParse(request.body);
      if (parsed.success === false) {
        throw new AppError("VALIDATION", "OTX configuration requires a non-empty apiKey", parsed.error.issues);
      }
      if (typeof request.body === "object" && request.body !== null && "model" in request.body) {
        send422(reply, "OTX configuration must not include a model");
        return reply;
      }
      return storeConfig(app, kind, encryptSecret(JSON.stringify(parsed.data)));
    }
    const body = PutIntegrationConfigBodySchema.parse(request.body);
    return storeConfig(app, kind, encryptSecret(JSON.stringify(body)));
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
    const startedAt = Date.now();
    if (kind === "SMTP") {
      const config = await loadStoredConfig<SmtpStoredConfig>("SMTP");
      if (config === null) {
        return { ok: false, detail: "no SMTP configuration stored" };
      }
      const outcome = await probeSmtp(config);
      return { ...outcome, latencyMs: Date.now() - startedAt };
    }
    if (kind === "WAHA") {
      const config = await loadStoredConfig<WahaStoredConfig>("WAHA");
      if (config === null) {
        return { ok: false, detail: "no WAHA configuration stored" };
      }
      const outcome = await probeWaha(config);
      return { ...outcome, latencyMs: Date.now() - startedAt };
    }
    const config = await loadStoredConfig<AiStoredConfig>(kind);
    if (config === null) {
      return { ok: false, detail: `no key configured for ${kind}` };
    }
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
