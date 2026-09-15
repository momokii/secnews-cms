import { apiFetch } from "./api";

/** Wire types + fetch functions for Surface 5 — integrations (contract #37-39).
 * Keys are AES-256-GCM encrypted server-side; responses carry maskedKey only
 * (INT-01). The raw key exists solely in PUT bodies, and only when the admin
 * types a fresh one. */

export type IntegrationKind =
  | "OPENAI"
  | "ANTHROPIC"
  | "GEMINI"
  | "DEEPSEEK"
  | "OTX"
  | "SMTP"
  | "WAHA";

export interface IntegrationConfigResponse {
  kind: IntegrationKind;
  model: string | null;
  hasKey: boolean;
  maskedKey: string | null;
  updatedAt: string;
  /** SMTP only — plain echo; the password never leaves the server unmasked. */
  host?: string | null;
  port?: number | null;
  user?: string | null;
  from?: string | null;
  maskedPassword?: string | null;
  /** WAHA only — plain echo; the API key never leaves the server unmasked. */
  baseUrl?: string | null;
  session?: string | null;
  maskedApiKey?: string | null;
}

/** Row of GET /integrations/available — configured kinds with default model. */
export interface AvailableIntegration {
  kind: IntegrationKind;
  model: string | null;
  hasKey: boolean;
}

/** Body for PUT /integrations/:kind — keyed kinds carry {apiKey}(+model, AI
 * only; OTX route 422s on model, contract #38). SMTP/WAHA carry their own
 * field sets; the kind travels in the URL, never in the body. */
export type PutIntegrationConfigBody =
  | { apiKey: string; model?: string }
  | { host: string; port: number; user: string; password: string; from: string }
  | { baseUrl: string; session: string; apiKey: string };

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
