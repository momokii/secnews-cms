import { apiFetch } from "./api";

/** Wire types + fetch functions for the AI prompt templates (contract:
 * GET /prompts → [{kind, content, updatedAt}]; PUT /prompts/:kind {content}
 * is ADMIN-only server-side). */

export type PromptKind = "FILL" | "ENRICH";

export interface PromptEntry {
  kind: PromptKind;
  content: string;
  updatedAt: string;
}

export async function listPrompts(): Promise<PromptEntry[]> {
  const response = await apiFetch("/prompts", { method: "GET" });
  return (await response.json()) as PromptEntry[];
}

export async function putPrompt(
  kind: PromptKind,
  content: string,
): Promise<PromptEntry> {
  const response = await apiFetch(`/prompts/${kind}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return (await response.json()) as PromptEntry;
}
