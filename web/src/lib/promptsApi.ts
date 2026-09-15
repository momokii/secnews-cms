import { apiFetch } from "./api";

/** Wire types + fetch functions for the AI prompt templates (contract:
 * GET /prompts → [{kind, content, updatedAt}]; PUT /prompts/:kind {content}
 * is ADMIN-only server-side; GET /prompts/:kind/history serves the
 * append-only revisions newest-first, paginated). */

export type PromptKind = "FILL" | "ENRICH";

export interface PromptEntry {
  kind: PromptKind;
  content: string;
  updatedAt: string;
}

/** One append-only prompt revision as served by GET /prompts/:kind/history. */
export interface PromptRevision {
  id: string;
  promptKind: PromptKind;
  content: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface PromptHistoryPage {
  items: PromptRevision[];
  total: number;
  page: number;
  pageSize: number;
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

export async function listPromptHistory(
  kind: PromptKind,
  page: number,
  pageSize: number,
): Promise<PromptHistoryPage> {
  const response = await apiFetch(
    `/prompts/${kind}/history?page=${page}&pageSize=${pageSize}`,
    { method: "GET" },
  );
  return (await response.json()) as PromptHistoryPage;
}
