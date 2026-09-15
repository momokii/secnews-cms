import { defaultFetch, type FetchLike } from "../../ai/providers/types.js";
import { upstreamFailure } from "../../../common/upstream.js";
import { loadStoredConfig } from "../../integrations/config-store.js";
import type { WahaStoredConfig } from "../../integrations/schema.js";

/**
 * WAHA gateway adapter (SND-P-01): POST {baseUrl}/api/sendText with X-Api-Key
 * and {session, chatId, text}. Gateway settings resolve DB-first: the WAHA
 * entry in the Integrations menu wins; WAHA_* env vars remain the fallback
 * until a row exists. Explicit options still override both. Tests inject
 * fetchImpl instead of touching the wire. Rejections carry the truncated
 * upstream body (TASK-RESEND) so the DeliveryAudit error column names the
 * real reason.
 */

export type WahaSendOptions = {
  chatId: string;
  text: string;
  baseUrl?: string;
  session?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
};

function env(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function sendWhatsApp(options: WahaSendOptions): Promise<void> {
  const stored = await loadStoredConfig<WahaStoredConfig>("WAHA");
  const baseUrl = options.baseUrl ?? stored?.baseUrl ?? env("WAHA_BASE_URL");
  const session = options.session ?? stored?.session ?? env("WAHA_SESSION");
  const apiKey = options.apiKey ?? stored?.apiKey ?? process.env["WAHA_API_KEY"] ?? "";
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const response = await fetchImpl(`${baseUrl}/api/sendText`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({ session, chatId: options.chatId, text: options.text }),
  });
  if (!response.ok) {
    const failure = await upstreamFailure("WAHA", response);
    throw new Error(`${failure.message}: ${failure.bodySnippet}`);
  }
}
