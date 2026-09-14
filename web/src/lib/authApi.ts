import { apiFetch } from "./api";
import type { SessionUser } from "./tokenStore";

export type AuthStatus = { readonly needsBootstrap: boolean };
export type AuthResponse = { readonly token: string; readonly user: SessionUser };

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("Invalid API response");
  return value as Record<string, unknown>;
}

function user(value: unknown): SessionUser {
  const data = record(value);
  if (typeof data.id !== "number" || typeof data.email !== "string" || typeof data.name !== "string" || typeof data.role !== "string") throw new Error("Invalid user response");
  return { id: data.id, email: data.email, name: data.name, role: data.role as SessionUser["role"] };
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await apiFetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const data = record(await readJson(response));
  if (typeof data.token !== "string") throw new Error("Invalid login response");
  return { token: data.token, user: user(data.user) };
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const data = record(await readJson(await apiFetch("/auth/status")));
  if (typeof data.needsBootstrap !== "boolean") throw new Error("Invalid auth status response");
  return { needsBootstrap: data.needsBootstrap };
}

export async function bootstrap(email: string, name: string, password: string): Promise<AuthResponse> {
  const response = await apiFetch("/bootstrap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name, password }) });
  const data = record(await readJson(response));
  if (typeof data.token !== "string") throw new Error("Invalid bootstrap response");
  return { token: data.token, user: user(data.user) };
}

export function apiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}
