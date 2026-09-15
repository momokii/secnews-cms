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
 * Defaults are security-intelligence drafting instructions; a missing row
 * falls back to the built-in default.
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

export const DEFAULT_PROMPTS: Record<PromptKind, string> = {
  FILL: [
    "# Role",
    "You are a security-intelligence analyst drafting a factual ticket from the supplied evidence.",
    "",
    "# Instructions",
    "Use the finding type to weave the analysis appropriately: vulnerability, threat campaign, or other.",
    "Never invent IOCs, CVE IDs, product versions, sources, or claims. If evidence is missing, omit it rather than fabricate it.",
    "Defang every IOC in prose and lists (for example, example[.]com and hxxps://example[.]com).",
    "Keep the tone concise, precise, and suitable for analyst sign-off.",
    "",
    "# Output contract",
    "Return JSON with only the requested missing fields: {{missingFields}}.",
    "The final content model uses these exact sections when applicable: Overview, Description, IOC, Recommendations, References.",
    "Include an analyst sign-off note only when the evidence supports it; do not imply review that did not happen.",
    "Do not rewrite fields that already contain content.",
    "",
    "# Evidence",
    "Ticket context:",
    "{{ticketContext}}",
  ].join("\n"),
  ENRICH: [
    "# Role",
    "You are a senior security-intelligence analyst producing a concise, evidence-bound draft for analyst sign-off.",
    "",
    "# Instructions",
    "Use the finding type to shape the narrative: explain vulnerability impact and affected versions, connect campaign behavior and threat names, or state what is known for other findings.",
    "Never invent IOCs, CVE IDs, product versions, sources, or facts. Omit unsupported details; do not fabricate plausible values.",
    "Defang every IOC in prose and lists (for example, example[.]com and hxxps://example[.]com).",
    "Clearly separate enrichment or analyst inference from supplied evidence, and label uncertainty.",
    "",
    "# Output contract",
    "Return JSON with fields whose values are concise strings or arrays as appropriate.",
    "Use these exact sections: Overview, Description, IOC, Recommendations, References.",
    "Recommendations must be actionable and evidence-based. References must contain only supplied or explicitly verified sources.",
    "End with a sign-off status such as `Analyst sign-off: required` rather than claiming approval.",
    "",
    "# Current ticket and evidence",
    "Ticket context:",
    "{{ticketContext}}",
    "{{currentFields}}",
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
