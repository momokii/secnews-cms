import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { IntegrationKind, SuggestionStatus } from "../../generated/prisma/enums.js";
import { decryptSecret } from "../../lib/crypto.js";
import { callAnthropic } from "./providers/anthropic.js";
import { callGemini } from "./providers/gemini.js";
import { callOpenAi } from "./providers/openai.js";
import { DEFAULT_MODELS, type ChatCompletionOptions, type ChatProviderFn } from "./providers/types.js";

/**
 * AI assist engine for fill/enrich. Provider + model come exclusively from
 * central integration config (never from the request). Model output is parsed
 * into per-field suggestions that land as PENDING AiSuggestion rows — the
 * ticket's final fields are only touched later, by suggestion accept.
 *
 * Semantic rejections (no provider configured, unreadable model output) throw
 * SemanticError; routes render it as the 422 VALIDATION envelope.
 */

export const SUGGESTIBLE_FIELDS = [
  "overview",
  "description",
  "recommendations",
  "references",
  "cveIds",
  "affectedVersions",
  "mitigation",
] as const;
export type SuggestibleField = (typeof SUGGESTIBLE_FIELDS)[number];

export class SemanticError extends Error {
  readonly details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "SemanticError";
    this.details = details;
  }
}

export type SuggestionDraft = {
  field: SuggestibleField;
  currentValue: string | null;
  suggestedValue: string;
};

type StoredProviderConfig = { apiKey: string; model?: string };

const PROVIDERS: Record<"OPENAI" | "ANTHROPIC" | "GEMINI", ChatProviderFn> = {
  OPENAI: callOpenAi,
  ANTHROPIC: callAnthropic,
  GEMINI: callGemini,
};

const PROVIDER_ORDER = [IntegrationKind.OPENAI, IntegrationKind.ANTHROPIC, IntegrationKind.GEMINI] as const;

export type TicketWithRelations = Prisma.TicketGetPayload<{ include: { iocs: true; sources: true } }>;

function unreadable(): SemanticError {
  return new SemanticError("AI provider returned an unreadable response");
}

/** First AI provider kind (OPENAI → ANTHROPIC → GEMINI) that holds a key. */
export async function resolveProvider(
  db: PrismaClient,
): Promise<{ kind: (typeof PROVIDER_ORDER)[number]; options: Pick<ChatCompletionOptions, "apiKey" | "model"> }> {
  const rows = await db.integrationConfig.findMany({
    where: { kind: { in: [...PROVIDER_ORDER] } },
  });
  const byKind = new Map(rows.map((row) => [row.kind, row] as const));
  for (const kind of PROVIDER_ORDER) {
    const row = byKind.get(kind);
    if (row === undefined) {
      continue;
    }
    const config = JSON.parse(decryptSecret(row.encryptedKey)) as StoredProviderConfig;
    return {
      kind,
      options: { apiKey: config.apiKey, model: config.model ?? DEFAULT_MODELS[kind] },
    };
  }
  throw new SemanticError("No AI provider configured — set a key under integrations first");
}

/** Current value of a final field as prompt/response text (lists joined by \n). */
export function currentValueOf(ticket: TicketWithRelations, field: SuggestibleField): string | null {
  const value: unknown = ticket[field];
  if (Array.isArray(value)) {
    const joined = value.filter((entry) => typeof entry === "string" && entry.trim() !== "").join("\n");
    return joined === "" ? null : joined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return value;
}

/** Fields with no current value — the strict fill scope. */
export function missingFields(ticket: TicketWithRelations): SuggestibleField[] {
  return SUGGESTIBLE_FIELDS.filter((field) => currentValueOf(ticket, field) === null);
}

function ticketContext(ticket: TicketWithRelations): string {
  const iocs = ticket.iocs.map((ioc) => `${ioc.type}:${ioc.value}`).join(", ");
  const sources = ticket.sources
    .map((source) => source.url ?? source.note ?? "")
    .filter((entry) => entry !== "")
    .join(", ");
  return [
    `title: ${ticket.title}`,
    `summary: ${ticket.summary}`,
    `findingType: ${ticket.findingType}`,
    `tlp: ${ticket.tlp}`,
    iocs === "" ? "" : `iocs: ${iocs}`,
    sources === "" ? "" : `sources: ${sources}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const SYSTEM_PROMPT = [
  "You are a cybersecurity news editor for a security operations team.",
  'Reply with ONLY a JSON object of the shape {"fields": {"<field>": "<text>", ...}}.',
  "Allowed field keys: overview, description, recommendations, references, cveIds, affectedVersions, mitigation.",
  "references and cveIds are newline-separated lists (CVE ids look like CVE-2024-12345).",
  "No markdown fences, no commentary, no keys outside the allowed list.",
].join(" ");

function buildPrompt(ticket: TicketWithRelations, mode: "fill" | "enrich"): string {
  if (mode === "fill") {
    const missing = missingFields(ticket);
    return [
      "Ticket context:",
      ticketContext(ticket),
      "",
      `Draft content for ONLY these missing final fields: ${missing.join(", ")}.`,
      "Do not include fields that already have content. JSON only.",
    ].join("\n");
  }
  const current = SUGGESTIBLE_FIELDS.map((field) => `${field}: ${currentValueOf(ticket, field) ?? "<empty>"}`);
  return [
    "Ticket context:",
    ticketContext(ticket),
    "",
    "Propose a full rewrite for EVERY final field listed below with its current value:",
    ...current,
    "JSON only.",
  ].join("\n");
}

/** Extract the {"fields": {...}} object from raw model output. */
function parseModelFields(raw: string): Map<string, string> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw unreadable();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw unreadable();
  }
  const fields = (parsed as { fields?: Record<string, unknown> })["fields"];
  const result = new Map<string, string>();
  if (typeof fields === "object" && fields !== null) {
    for (const [key, value] of Object.entries(fields)) {
      if ((SUGGESTIBLE_FIELDS as readonly string[]).includes(key) && typeof value === "string" && value.trim() !== "") {
        result.set(key, value.trim());
      }
    }
  }
  return result;
}

/** Run one completion against the resolved provider and return field drafts. */
export async function generateSuggestions(
  db: PrismaClient,
  ticket: TicketWithRelations,
  mode: "fill" | "enrich",
): Promise<Array<{ model: string } & SuggestionDraft>> {
  const provider = await resolveProvider(db);
  const call = PROVIDERS[provider.kind];
  const raw = await call({ ...provider.options, system: SYSTEM_PROMPT, prompt: buildPrompt(ticket, mode) });
  const fields = parseModelFields(raw);

  const scope = mode === "fill" ? missingFields(ticket) : [...SUGGESTIBLE_FIELDS];
  const drafts: Array<{ model: string } & SuggestionDraft> = [];
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
    });
  }
  return drafts;
}

export type SuggestionRow = {
  id: string;
  ticketId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  model: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Persist drafts as PENDING rows; the content column holds the JSON payload. */
export async function storeSuggestions(
  db: PrismaClient,
  ticketId: string,
  drafts: Array<{ model: string } & SuggestionDraft>,
): Promise<SuggestionRow[]> {
  return db.$transaction(
    drafts.map((draft) =>
      db.aiSuggestion.create({
        data: {
          ticketId,
          status: SuggestionStatus.PENDING,
          model: draft.model,
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
