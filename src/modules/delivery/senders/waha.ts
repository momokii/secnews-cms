import { defaultFetch, upstreamError, type FetchLike } from "../../ai/providers/types.js";

/**
 * WAHA gateway adapter (SND-P-01): POST {WAHA_BASE_URL}/api/sendText with
 * X-Api-Key and {session, chatId, text}. Gateway settings come from env;
 * tests inject fetchImpl instead of touching the wire.
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
  const baseUrl = options.baseUrl ?? env("WAHA_BASE_URL");
  const session = options.session ?? env("WAHA_SESSION");
  const apiKey = options.apiKey ?? process.env["WAHA_API_KEY"] ?? "";
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const response = await fetchImpl(`${baseUrl}/api/sendText`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({ session, chatId: options.chatId, text: options.text }),
  });
  if (!response.ok) {
    throw upstreamError("WAHA", response.status);
  }
}
