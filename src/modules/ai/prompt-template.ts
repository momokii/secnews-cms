import type { PrismaClient } from "../../generated/prisma/client.js";
import { PromptKind } from "../../generated/prisma/enums.js";
import {
  currentValueOf,
  iocValues,
  missingFields,
  selectedSourcesBlock,
  sourceDraftTicketContext,
  sourceValues,
  SUGGESTIBLE_FIELDS,
  ticketContext,
  type SourceDraftField,
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
  {
    name: "title",
    description: "Ticket title verbatim",
  },
  {
    name: "summary",
    description: "Ticket summary verbatim",
  },
  {
    name: "findingType",
    description: "Ticket finding type (VULNERABILITY, THREAT_CAMPAIGN, OTHER)",
  },
  {
    name: "tlp",
    description: "Ticket TLP level (AMBER default)",
  },
  {
    name: "iocs",
    description: "IOCs as type:value, comma-joined — empty string when none",
  },
  {
    name: "sources",
    description: "Source urls/notes, comma-joined — empty string when none",
  },
  {
    name: "selectedSources",
    description:
      "Source-draft only: numbered list of the analyst-chosen grounding sources with title, url and notes per source (empty in fill/enrich)",
  },
  {
    name: "targetFields",
    description:
      "Source-draft only: comma-joined requested output fields (overview, description, recommendations, references) — empty in fill/enrich",
  },
  {
    name: "overview",
    description: "Current overview, or empty string when unset",
  },
  {
    name: "description",
    description: "Current description, or empty string when unset",
  },
  {
    name: "recommendations",
    description: "Current recommendations, or empty string when unset",
  },
  {
    name: "references",
    description: "Current newline-joined references, or empty string when unset",
  },
  {
    name: "cveIds",
    description: "Current newline-joined CVE ids, or empty string when unset",
  },
  {
    name: "affectedVersions",
    description: "Current newline-joined affected versions, or empty string when unset",
  },
  {
    name: "mitigation",
    description: "Current mitigation, or empty string when unset",
  },
] as const satisfies readonly { name: keyof PromptBindings; description: string }[];

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
  SOURCE_DRAFT: [
    "# Role",
    "You are a security-intelligence analyst drafting the narrative sections of a ticket, grounded ONLY in the sources the analyst selected below.",
    "",
    "# Instructions",
    "Ground every statement in the selected sources. Keep numbers, versions, CVE ids, and dates verbatim from the source that states them.",
    "Never invent IOCs, CVE IDs, product versions, sources, or claims that the selected sources do not support. If the sources are silent, omit it rather than fabricate it.",
    "The selected sources are the only permitted evidence: do not add knowledge, references, or context from anywhere else.",
    "Defang every IOC in prose and lists (for example, example[.]com and hxxps://example[.]com).",
    "Keep the tone concise, precise, and suitable for analyst sign-off.",
    "",
    "# Output contract",
    'Return JSON of the shape {"fields": {"<field>": "<text>", ...}} with ONLY the requested fields: {{targetFields}}.',
    "No markdown fences, no commentary, no keys outside the requested fields.",
    "For a references request, list the supporting selected source URLs one per line, most authoritative first; omit a URL the sources cannot support.",
    'Example — for requested fields overview, references a correct answer is:',
    '{"fields": {"overview": "One paragraph grounded in the selected sources.", "references": "https://advisory.example/a\\nhttps://report.example/b"}}',
    "",
    "Selected sources:",
    "{{selectedSources}}",
    "",
    "Ticket context:",
    "{{ticketContext}}",
  ].join("\n"),
};

/** The ticket-data values the renderer substitutes into a template: the three
 * aggregated blocks plus one granular entry per ticket header, evidence list,
 * and suggestible final field. Every key matches a PROMPT_PLACEHOLDERS name. */
export type PromptBindings = {
  ticketContext: string;
  missingFields: string;
  currentFields: string;
  title: string;
  summary: string;
  findingType: string;
  tlp: string;
  iocs: string;
  sources: string;
  /** Source-draft only: bound by sourceDraftPromptBindings, "" in fill/enrich. */
  selectedSources: string;
  targetFields: string;
  overview: string;
  description: string;
  recommendations: string;
  references: string;
  cveIds: string;
  affectedVersions: string;
  mitigation: string;
};

type FinalFieldBindings = Pick<PromptBindings, (typeof SUGGESTIBLE_FIELDS)[number]>;

function finalFieldBindings(ticket: TicketWithRelations): FinalFieldBindings {
  return {
    overview: currentValueOf(ticket, "overview") ?? "",
    description: currentValueOf(ticket, "description") ?? "",
    recommendations: currentValueOf(ticket, "recommendations") ?? "",
    references: currentValueOf(ticket, "references") ?? "",
    cveIds: currentValueOf(ticket, "cveIds") ?? "",
    affectedVersions: currentValueOf(ticket, "affectedVersions") ?? "",
    mitigation: currentValueOf(ticket, "mitigation") ?? "",
  };
}

export function promptBindings(ticket: TicketWithRelations): PromptBindings {
  return {
    ticketContext: ticketContext(ticket),
    missingFields: missingFields(ticket).join(", "),
    currentFields: SUGGESTIBLE_FIELDS.map((field) => `${field}: ${currentValueOf(ticket, field) ?? "<empty>"}`).join(
      "\n",
    ),
    title: ticket.title,
    summary: ticket.summary,
    findingType: ticket.findingType,
    tlp: ticket.tlp,
    iocs: iocValues(ticket),
    sources: sourceValues(ticket),
    selectedSources: "",
    targetFields: "",
    ...finalFieldBindings(ticket),
  };
}

/** Source-draft bindings: the standard ticket bindings plus the numbered
 * grounding-source block and the comma-joined requested output fields. */
export function sourceDraftPromptBindings(
  ticket: TicketWithRelations,
  chosenSources: TicketWithRelations["sources"],
  targetFields: readonly SourceDraftField[],
): PromptBindings {
  return {
    ...promptBindings(ticket),
    ticketContext: sourceDraftTicketContext(ticket),
    selectedSources: selectedSourcesBlock(chosenSources),
    targetFields: targetFields.join(", "),
  };
}

/** Substitute every bound placeholder occurrence (repeatable). Unknown
 * {{...}} text is untouched — only keys of PromptBindings are replaced. */
export function renderPromptTemplate(template: string, bindings: PromptBindings): string {
  let rendered = template;
  for (const [name, value] of Object.entries(bindings)) {
    rendered = rendered.replaceAll(`{{${name}}}`, value);
  }
  return rendered;
}

/** Stored ADMIN template for the kind — or the built-in default when the row
 * is absent (resilience; mirrors the bulletin-template GET behavior). */
export async function loadPromptTemplate(db: PrismaClient, kind: PromptKind): Promise<string> {
  const row = await db.promptTemplate.findUnique({ where: { kind }, select: { content: true } });
  return row?.content ?? DEFAULT_PROMPTS[kind];
}
