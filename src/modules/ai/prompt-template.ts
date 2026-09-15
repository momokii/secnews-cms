import type { PrismaClient } from "../../generated/prisma/client.js";
import { PromptKind } from "../../generated/prisma/enums.js";
import {
  currentValueOf,
  missingFields,
  SUGGESTIBLE_FIELDS,
  ticketContext,
  type TicketWithRelations,
} from "./prompts.js";

/**
 * TASK-PROMPT — stored prompt templates for fill/enrich. An ADMIN edits the
 * exact template per kind (PromptTemplate row, unique kind); the AI engine
 * renders it by substituting the bound placeholders with ticket data.
 * Defaults are the legacy hardcoded prompts moved verbatim (seeded by the
 * migration); a missing row falls back to the built-in default.
 */

export type PromptMode = "fill" | "enrich";

export function modeToKind(mode: PromptMode): PromptKind {
  return mode === "fill" ? PromptKind.FILL : PromptKind.ENRICH;
}

/** Placeholder legend served by GET /prompts — the variables the renderer
 * actually binds. Unknown {{...}} text in a stored template passes through
 * untouched (never fabricated). */
export const PROMPT_PLACEHOLDERS = [
  {
    name: "ticketContext",
    description:
      "Ticket header block: title, summary, findingType, tlp, iocs (type:value, comma-joined), sources — lines appear only when non-empty",
  },
  {
    name: "missingFields",
    description:
      "Comma-joined final fields with no current value (the strict fill scope: overview, description, cveIds, affectedVersions, mitigation)",
  },
  {
    name: "currentFields",
    description: "One line per suggestible final field: \"<field>: <current value or <empty>>\"",
  },
] as const;

/** Legacy hardcoded prompts, verbatim (verbatim move — rendered output is
 * byte-identical to the previous buildPrompt implementations). */
export const DEFAULT_PROMPTS: Record<PromptKind, string> = {
  FILL: [
    "Ticket context:",
    "{{ticketContext}}",
    "",
    "Draft content for ONLY these missing final fields: {{missingFields}}.",
    "Do not include fields that already have content. JSON only.",
  ].join("\n"),
  ENRICH: [
    "Ticket context:",
    "{{ticketContext}}",
    "",
    "Propose a full rewrite for EVERY final field listed below with its current value:",
    "{{currentFields}}",
    "JSON only.",
  ].join("\n"),
};

/** The ticket-data values the renderer substitutes into a template. */
export type PromptBindings = {
  ticketContext: string;
  missingFields: string;
  currentFields: string;
};

export function promptBindings(ticket: TicketWithRelations): PromptBindings {
  return {
    ticketContext: ticketContext(ticket),
    missingFields: missingFields(ticket).join(", "),
    currentFields: SUGGESTIBLE_FIELDS.map((field) => `${field}: ${currentValueOf(ticket, field) ?? "<empty>"}`).join(
      "\n",
    ),
  };
}

/** Substitute every bound placeholder occurrence (repeatable). */
export function renderPromptTemplate(template: string, bindings: PromptBindings): string {
  return template
    .replaceAll("{{ticketContext}}", bindings.ticketContext)
    .replaceAll("{{missingFields}}", bindings.missingFields)
    .replaceAll("{{currentFields}}", bindings.currentFields);
}

/** Stored ADMIN template for the kind — or the built-in default when the row
 * is absent (resilience; mirrors the bulletin-template GET behavior). */
export async function loadPromptTemplate(db: PrismaClient, kind: PromptKind): Promise<string> {
  const row = await db.promptTemplate.findUnique({ where: { kind }, select: { content: true } });
  return row?.content ?? DEFAULT_PROMPTS[kind];
}
