import type { Prisma } from "../../generated/prisma/client.js";

/**
 * AI prompt + model-output handling: the suggestible final-field vocabulary,
 * the system prompt, per-mode prompt construction, and the strict extraction
 * of the {"fields": {...}} object from raw model output. Provider selection
 * and suggestion persistence live in ./service.js.
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

export type TicketWithRelations = Prisma.TicketGetPayload<{ include: { iocs: true; sources: true } }>;

function unreadable(): SemanticError {
  return new SemanticError("AI provider returned an unreadable response");
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

/** Fields fill may draft: the required finals plus typed working fields.
 * recommendations/references are §10-optional — fill never invents them;
 * empty stays empty until the analyst writes them. */
const AUTO_FILL_FIELDS = [
  "overview",
  "description",
  "cveIds",
  "affectedVersions",
  "mitigation",
] as const satisfies readonly SuggestibleField[];

/** Fields with no current value — the strict fill scope (never recs/refs). */
export function missingFields(ticket: TicketWithRelations): SuggestibleField[] {
  return AUTO_FILL_FIELDS.filter((field) => currentValueOf(ticket, field) === null);
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

export const SYSTEM_PROMPT = [
  "You are a cybersecurity news editor for a security operations team.",
  'Reply with ONLY a JSON object of the shape {"fields": {"<field>": "<text>", ...}}.',
  "Allowed field keys: overview, description, recommendations, references, cveIds, affectedVersions, mitigation.",
  "references and cveIds are newline-separated lists (CVE ids look like CVE-2024-12345).",
  "No markdown fences, no commentary, no keys outside the allowed list.",
].join(" ");

export function buildPrompt(ticket: TicketWithRelations, mode: "fill" | "enrich"): string {
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
export function parseModelFields(raw: string): Map<string, string> {
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
