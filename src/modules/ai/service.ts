import type { PrismaClient } from "../../generated/prisma/client.js";
import { IntegrationKind, SuggestionStatus } from "../../generated/prisma/enums.js";
import { AppError } from "../../common/errors.js";
import { decryptSecret } from "../../lib/crypto.js";
import { upstream502, UpstreamError } from "../../common/upstream.js";
import { callAnthropic } from "./providers/anthropic.js";
import { callDeepSeek } from "./providers/deepseek.js";
import { callGemini } from "./providers/gemini.js";
import { callOpenAi } from "./providers/openai.js";
import { DEFAULT_MODELS, type ChatCompletionOptions, type ChatProviderFn } from "./providers/types.js";
import {
  currentValueOf,
  missingFields,
  parseModelFields,
  SemanticError,
  SYSTEM_PROMPT,
  SUGGESTIBLE_FIELDS,
  type SuggestibleField,
  type TicketWithRelations,
} from "./prompts.js";
import { loadPromptTemplate, modeToKind, promptBindings, renderPromptTemplate } from "./prompt-template.js";

/**
 * AI assist engine for fill/enrich. Provider + model resolve per request:
 * an explicit {provider, model} body choice wins; otherwise the first
 * configured provider (OPENAI → ANTHROPIC → GEMINI → DEEPSEEK) with its
 * configured (or default) model. An explicit provider without a key is a
 * semantic rejection — never a silent fallback. Model output is parsed into
 * per-field suggestions that land as PENDING AiSuggestion rows carrying
 * the resolved provider + model — the ticket's final fields are only
 * touched later, by suggestion accept.
 *
 * Semantic rejections (no provider configured, unreadable model output) throw
 * SemanticError; routes render it as the 422 VALIDATION envelope.
 */

export { SUGGESTIBLE_FIELDS, type SuggestibleField, type TicketWithRelations } from "./prompts.js";
export { SemanticError };

export type SuggestionDraft = {
  field: SuggestibleField;
  currentValue: string | null;
  suggestedValue: string;
};

type StoredProviderConfig = { apiKey: string; model?: string };

type ProviderChoice = {
  provider?: "OPENAI" | "ANTHROPIC" | "GEMINI" | "DEEPSEEK";
  model?: string;
};

const PROVIDERS: Record<"OPENAI" | "ANTHROPIC" | "GEMINI" | "DEEPSEEK", ChatProviderFn> = {
  OPENAI: callOpenAi,
  ANTHROPIC: callAnthropic,
  GEMINI: callGemini,
  DEEPSEEK: callDeepSeek,
};

const PROVIDER_ORDER = [IntegrationKind.OPENAI, IntegrationKind.ANTHROPIC, IntegrationKind.GEMINI, IntegrationKind.DEEPSEEK] as const;

type ProviderKind = (typeof PROVIDER_ORDER)[number];

/** Fetch-level failure: undici rejects with TypeError("fetch failed"), the
 * real cause (ENOTFOUND/ECONNREFUSED/UND_ERR_CONNECT_TIMEOUT/…) chained. */
function isNetworkFailure(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof TypeError) {
      return true;
    }
    const code = (current as NodeJS.ErrnoException).code;
    if (typeof code === "string" && (code.startsWith("E") || code.startsWith("UND_ERR_"))) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** First AI provider kind (OPENAI → ANTHROPIC → GEMINI) that holds a key —
 * or exactly the explicit choice, which must hold a key (422 otherwise). */
export async function resolveProvider(
  db: PrismaClient,
  explicit: ProviderChoice = {},
): Promise<{ kind: ProviderKind; options: Pick<ChatCompletionOptions, "apiKey" | "model"> }> {
  const rows = await db.integrationConfig.findMany({
    where: { kind: { in: [...PROVIDER_ORDER] } },
  });
  const byKind = new Map(rows.map((row) => [row.kind, row] as const));
  const order = explicit.provider === undefined ? [...PROVIDER_ORDER] : [explicit.provider];
  for (const kind of order) {
    const row = byKind.get(kind);
    if (row === undefined) {
      continue;
    }
    const config = JSON.parse(decryptSecret(row.encryptedKey)) as StoredProviderConfig;
    return {
      kind,
      options: { apiKey: config.apiKey, model: explicit.model ?? config.model ?? DEFAULT_MODELS[kind] },
    };
  }
  if (explicit.provider !== undefined) {
    throw new SemanticError(`${explicit.provider} has no configured key — set it under integrations first or omit provider`);
  }
  throw new SemanticError("No AI provider configured — set a key under integrations first");
}

/** Run one completion against the resolved provider and return field drafts. */
export async function generateSuggestions(
  db: PrismaClient,
  ticket: TicketWithRelations,
  mode: "fill" | "enrich",
  explicit: ProviderChoice = {},
): Promise<Array<{ model: string; provider: ProviderKind } & SuggestionDraft>> {
  const provider = await resolveProvider(db, explicit);
  const call = PROVIDERS[provider.kind];
  const template = await loadPromptTemplate(db, modeToKind(mode));
  let raw: string;
  try {
    raw = await call({
      ...provider.options,
      system: SYSTEM_PROMPT,
      prompt: renderPromptTemplate(template, promptBindings(ticket)),
    });
  } catch (error) {
    if (isNetworkFailure(error)) {
      throw new AppError(
        "INTERNAL",
        `${provider.kind} unreachable from server (network/DNS timeout) — check server egress or use another provider`,
        undefined,
        502,
      );
    }
    if (error instanceof UpstreamError) {
      throw upstream502(error);
    }
    throw error;
  }
  const fields = parseModelFields(raw);

  const scope = mode === "fill" ? missingFields(ticket) : [...SUGGESTIBLE_FIELDS];
  const drafts: Array<{ model: string; provider: ProviderKind } & SuggestionDraft> = [];
  for (const field of scope) {
    const suggested = fields.get(field);
    if (suggested === undefined) {
      continue;
    }
    drafts.push({
      field,
      currentValue: currentValueOf(ticket, field),
      suggestedValue: suggested,
      model: provider.options.model,
      provider: provider.kind,
    });
  }
  return drafts;
}

export type SuggestionRow = {
  id: string;
  ticketId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  model: string | null;
  provider: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Persist drafts as PENDING rows; the content column holds the JSON payload. */
export async function storeSuggestions(
  db: PrismaClient,
  ticketId: string,
  drafts: Array<{ model: string; provider: ProviderKind } & SuggestionDraft>,
): Promise<SuggestionRow[]> {
  return db.$transaction(
    drafts.map((draft) =>
      db.aiSuggestion.create({
        data: {
          ticketId,
          status: SuggestionStatus.PENDING,
          model: draft.model,
          provider: draft.provider,
          content: JSON.stringify({
            field: draft.field,
            currentValue: draft.currentValue,
            suggestedValue: draft.suggestedValue,
          }),
        },
      }),
    ),
  );
}

/** DB row → wire suggestion (AiSuggestionSchema shape, ISO datetime strings). */
export function toSuggestion(row: SuggestionRow): {
  id: string;
  ticketId: string;
  field: string;
  currentValue: string | null;
  suggestedValue: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  model: string | null;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
} {
  const payload = JSON.parse(row.content) as { field?: string; currentValue?: string | null; suggestedValue?: string };
  return {
    id: row.id,
    ticketId: row.ticketId,
    field: payload.field ?? "",
    currentValue: payload.currentValue ?? null,
    suggestedValue: payload.suggestedValue ?? "",
    status: row.status,
    model: row.model,
    provider: row.provider,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
