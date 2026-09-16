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

/** Fields source-draft may target: the narrative output sections only — the
 * typed working fields (cveIds etc.) are fill/enrich territory. */
export const SOURCE_DRAFT_FIELDS = ["overview", "description", "recommendations", "references"] as const;
export type SourceDraftField = (typeof SOURCE_DRAFT_FIELDS)[number];

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

/** Comma-joined "type:value" IOC list — empty string when the ticket has none. */
export function iocValues(ticket: TicketWithRelations): string {
  return ticket.iocs.map((ioc) => `${ioc.type}:${ioc.value}`).join(", ");
}

/** Comma-joined source titles/urls/notes — empty string when the ticket has none. */
export function sourceValues(ticket: TicketWithRelations): string {
  return ticket.sources
    .map((source) => source.title ?? source.url ?? source.note ?? "")
    .filter((entry) => entry !== "")
    .join(", ");
}

/** Numbered {{selectedSources}} block: title, url, notes per source — the
 * grounding evidence for source-draft. `note` is the legacy short form,
 * shown only when the long-form `notes` is absent. */
export function selectedSourcesBlock(sources: TicketWithRelations["sources"]): string {
  if (sources.length === 0) {
    return "(no sources selected)";
  }
  return sources
    .map((source, index) => {
      return [
        `${index + 1}. title: ${source.title ?? "(none)"}`,
        `   url: ${source.url ?? "(none)"}`,
        `   notes: ${source.notes ?? source.note ?? "(none)"}`,
      ].join("\n");
    })
    .join("\n");
}

/** The ticket header block injected as the {{ticketContext}} prompt placeholder. */
export function ticketContext(ticket: TicketWithRelations): string {
  return [
    `title: ${ticket.title}`,
    `summary: ${ticket.summary}`,
    `findingType: ${ticket.findingType}`,
    `tlp: ${ticket.tlp}`,
    iocLine(ticket),
    sourceLine(ticket),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Source-draft header block: the chosen grounding sources are injected
 * separately via {{selectedSources}} — an all-sources line here would leak
 * evidence the analyst did not select. */
export function sourceDraftTicketContext(ticket: TicketWithRelations): string {
  return [
    `title: ${ticket.title}`,
    `summary: ${ticket.summary}`,
    `findingType: ${ticket.findingType}`,
    `tlp: ${ticket.tlp}`,
    iocLine(ticket),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function iocLine(ticket: TicketWithRelations): string {
  const iocs = iocValues(ticket);
  return iocs === "" ? "" : `iocs: ${iocs}`;
}

function sourceLine(ticket: TicketWithRelations): string {
  const sources = sourceValues(ticket);
  return sources === "" ? "" : `sources: ${sources}`;
}

export const SYSTEM_PROMPT = [
  "You are a cybersecurity news editor for a security operations team.",
  'Reply with ONLY a JSON object of the shape {"fields": {"<field>": "<text>", ...}}.',
  "Allowed field keys: overview, description, recommendations, references, cveIds, affectedVersions, mitigation.",
  "references and cveIds are newline-separated lists (CVE ids look like CVE-2024-12345).",
  "No markdown fences, no commentary, no keys outside the allowed list.",
].join(" ");

/** Extract the field payload from raw model output: the canonical
 * {"fields": {...}} wrapper, or (TASK-PROMPT) a bare object of allowed keys —
 * ADMIN prompt edits often drop the wrapper wording, and the flat form must
 * still yield suggestions instead of a silent 0. Unknown keys drop either way. */
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
  const container: Record<string, unknown> =
    typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const nested = container["fields"];
  const source: Record<string, unknown> =
    typeof nested === "object" && nested !== null ? (nested as Record<string, unknown>) : container;
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(source)) {
    if ((SUGGESTIBLE_FIELDS as readonly string[]).includes(key) && typeof value === "string" && value.trim() !== "") {
      result.set(key, value.trim());
    }
  }
  return result;
}
