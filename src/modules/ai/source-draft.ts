import type { PrismaClient } from "../../generated/prisma/client.js";
import { PromptKind } from "../../generated/prisma/enums.js";
import {
  currentValueOf,
  parseModelFields,
  SYSTEM_PROMPT,
  type SourceDraftField,
  type TicketWithRelations,
} from "./prompts.js";
import { loadPromptTemplate, renderPromptTemplate, sourceDraftPromptBindings } from "./prompt-template.js";
import { runCompletion, type ProviderChoice, type ProviderRun, type SuggestionDraft } from "./service.js";

/**
 * Source-grounded drafting (TASK-SRC-DRAFT). The analyst picks the ticket
 * sources that may ground the draft and which narrative fields to produce;
 * the model must not go beyond those sources unless web search was enabled
 * (and then only for references, as prompt augmentation — the server never
 * fetches anything itself). Output flows through the same extraction and
 * lands as PENDING AiSuggestion rows via the shared storeSuggestions.
 */

const WEB_SEARCH_AUGMENTATION = [
  "# Web search augmentation (references only)",
  "The analyst enabled online web search for the references field. You may use live web browsing, when your runtime provides it, to add a few extra reputable references beyond the selected sources (vendor advisories, official CVE records, established security press).",
  "Every added reference must be a real URL you are highly confident resolves — never invent or guess URLs, and keep the selected sources listed first.",
  "Every other requested field remains strictly grounded in the selected sources.",
].join("\n");

/** Sources ordered as the analyst listed them; the route has already
 * verified every id belongs to this ticket. */
function orderSources(
  sources: TicketWithRelations["sources"],
  sourceIds: readonly string[],
): TicketWithRelations["sources"] {
  const byId = new Map(sources.map((source) => [source.id, source] as const));
  return sourceIds.flatMap((id) => {
    const source = byId.get(id);
    return source === undefined ? [] : [source];
  });
}

export async function generateSourceDraftSuggestions(
  db: PrismaClient,
  ticket: TicketWithRelations,
  input: {
    sourceIds: string[];
    targetFields: SourceDraftField[];
    allowWebSearch: boolean;
    explicit: ProviderChoice;
  },
): Promise<Array<{ model: string; provider: ProviderRun["kind"] } & SuggestionDraft>> {
  const chosen = orderSources(ticket.sources, input.sourceIds);
  const targetFields = [...new Set(input.targetFields)];
  const template = await loadPromptTemplate(db, PromptKind.SOURCE_DRAFT);
  let prompt = renderPromptTemplate(template, sourceDraftPromptBindings(ticket, chosen, targetFields));
  if (input.allowWebSearch && targetFields.includes("references")) {
    prompt += `\n\n${WEB_SEARCH_AUGMENTATION}`;
  }
  const { raw, kind, model } = await runCompletion(db, input.explicit, SYSTEM_PROMPT, prompt);
  const fields = parseModelFields(raw);

  const drafts: Array<{ model: string; provider: ProviderRun["kind"] } & SuggestionDraft> = [];
  for (const field of targetFields) {
    const suggested = fields.get(field);
    if (suggested === undefined) {
      continue;
    }
    drafts.push({ field, currentValue: currentValueOf(ticket, field), suggestedValue: suggested, model, provider: kind });
  }
  return drafts;
}
