import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Shared E2E harness for scripts/e2e/s1..s5. Scripts speak real HTTP against
 * the dev-stack server spawned by run.ts (transports stubbed inside the
 * server process — never on the wire). Admin credentials are minted once by
 * s1 (bootstrap + login) and handed to s2..s5 via a state file, because
 * /auth/login is rate-limited to 5/min/IP.
 */

export const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://127.0.0.1:3777";
export const CTRL_URL = process.env["E2E_CTRL_URL"] ?? "http://127.0.0.1:3778";
export const STATE_FILE = join(tmpdir(), "secnews-e2e-state.json");

export const ADMIN_EMAIL = "e2e-admin@secnews.test";
export const ADMIN_PASSWORD = "e2e-admin-password-1";
export const ANALYST_EMAIL = "e2e-analyst@secnews.test";
export const ANALYST_PASSWORD = "e2e-analyst-password-1";

export type AdminState = { token: string; userId: string; email: string };

export function saveState(state: AdminState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state));
}

export function loadState(): AdminState {
  if (!existsSync(STATE_FILE)) {
    throw new Error(
      `E2E state file missing at ${STATE_FILE} — run the suite via "npm run test:e2e" (s1 bootstraps and mints the admin token).`,
    );
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as AdminState;
}

export function clearState(): void {
  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }
}

export function ok(condition: boolean, label: string, extra?: unknown): void {
  if (!condition) {
    const detail = extra === undefined ? "" : ` :: ${JSON.stringify(extra)}`;
    throw new Error(`E2E FAIL: ${label}${detail}`);
  }
}

export type ApiOptions = {
  token?: string;
  apiKey?: string;
  body?: unknown;
};

export type ApiResult<T> = {
  status: number;
  body: T;
};

export async function api<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: ApiOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (options.token !== undefined) {
    headers["authorization"] = `Bearer ${options.token}`;
  }
  if (options.apiKey !== undefined) {
    headers["x-api-key"] = options.apiKey;
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  const body = (text === "" ? undefined : JSON.parse(text)) as T;
  return { status: response.status, body };
}

export type ErrorEnvelope = {
  error: { code: string; message: string; details?: unknown };
};

/** Assert a non-2xx response carries the canonical envelope code at the exact status. */
export function expectError(
  result: ApiResult<unknown>,
  status: number,
  code: string,
  label: string,
): ErrorEnvelope {
  ok(result.status === status, `${label}: expected HTTP ${status}`, result);
  const envelope = result.body as ErrorEnvelope;
  ok(envelope.error?.code === code, `${label}: expected error code ${code}`, result.body);
  return envelope;
}

export function step(label: string): void {
  console.log(`  ok: ${label}`);
}

// ---- Composite fixtures over the real API ----

/** MANUAL/OTHER ticket walked OPEN → RESEARCH → READY through the state machine. */
export async function createReadyTicket(admin: AdminState, title: string): Promise<string> {
  const created = await api<{ id: string }>("POST", "/tickets", {
    token: admin.token,
    body: { title, findingType: "OTHER" },
  });
  ok(created.status === 201, "POST /tickets → 201", created.body);
  for (const to of ["RESEARCH", "READY"] as const) {
    const moved = await api<{ status: string }>("POST", `/tickets/${created.body.id}/transition`, {
      token: admin.token,
      body: { to },
    });
    ok(moved.status === 200 && moved.body.status === to, `transition → ${to}`, moved.body);
  }
  return created.body.id;
}

export type ClientWithChannel = { clientId: string; channelId: string };

export async function createChannel(
  admin: AdminState,
  clientId: string,
  body:
    | { type: "WHATSAPP"; chatId: string }
    | { type: "TELEGRAM"; chatId: string; token: string }
    | { type: "EMAIL"; bcc: string[] },
): Promise<string> {
  const created = await api<{ id: string }>("POST", `/clients/${clientId}/channels`, {
    token: admin.token,
    body,
  });
  ok(created.status === 201, `POST /clients/${clientId}/channels (${body.type}) → 201`, created.body);
  return created.body.id;
}

export function uniqueId(): string {
  return randomUUID();
}
