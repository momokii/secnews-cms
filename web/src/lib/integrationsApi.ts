import { apiFetch } from "./api";

/** Wire types + fetch functions for Surface 5 — integrations (contract #37-39).
 * Keys are AES-256-GCM encrypted server-side; responses carry maskedKey only
 * (INT-01). The raw key exists solely in PUT bodies, and only when the admin
 * types a fresh one. */

export type IntegrationKind = "OPENAI" | "ANTHROPIC" | "GEMINI" | "DEEPSEEK" | "OTX";

export interface IntegrationConfigResponse {
  kind: IntegrationKind;
  model: string | null;
  hasKey: boolean;
  maskedKey: string | null;
  updatedAt: string;
}

/** Row of GET /integrations/available — configured kinds with default model. */
export interface AvailableIntegration {
  kind: IntegrationKind;
  model: string | null;
  hasKey: boolean;
}

/** Body for PUT /integrations/:kind — apiKey required (contract #38); OTX
 * callers must omit model (route 422s otherwise). */
export interface PutIntegrationConfigBody {
  apiKey: string;
  model?: string;
}

export interface TestConnectionResponse {
  ok: boolean;
  detail?: string;
  latencyMs?: number;
}

export async function getIntegrationConfig(
  kind: IntegrationKind,
): Promise<IntegrationConfigResponse> {
  const response = await apiFetch(`/integrations/${kind}`, { method: "GET" });
  return (await response.json()) as IntegrationConfigResponse;
}

export async function listAvailableIntegrations(): Promise<AvailableIntegration[]> {
  const response = await apiFetch("/integrations/available", { method: "GET" });
  return (await response.json()) as AvailableIntegration[];
}

export async function putIntegrationConfig(
  kind: IntegrationKind,
  body: PutIntegrationConfigBody,
): Promise<IntegrationConfigResponse> {
  const response = await apiFetch(`/integrations/${kind}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as IntegrationConfigResponse;
}

export async function testIntegration(
  kind: IntegrationKind,
): Promise<TestConnectionResponse> {
  const response = await apiFetch(`/integrations/${kind}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return (await response.json()) as TestConnectionResponse;
}
