import { defaultFetch, type FetchLike } from "../../ai/providers/types.js";
import { upstreamFailure } from "../../../common/upstream.js";

/**
 * Telegram Bot API adapter (SND-P-02): POST
 * https://api.telegram.org/bot<token>/sendMessage with {chat_id, text}.
 * The bot token travels only to api.telegram.org; tests inject fetchImpl.
 * Rejections carry the truncated upstream body (TASK-RESEND) so the
 * DeliveryAudit error column names the real reason (e.g. Telegram's
 * 429 "Too Many Requests: retry after N"). A network-level rejection is
 * unwrapped from undici's bare "fetch failed" down its cause chain
 * (TASK-TELEGRAM-NET), and every call carries an abort timeout so a hung
 * connection cannot stall the dispatch.
 */

export type TelegramSendOptions = {
  token: string;
  chatId: string;
  text: string;
  fetchImpl?: FetchLike;
};

const TELEGRAM_API = "https://api.telegram.org";
const TELEGRAM_TIMEOUT_MS = 15_000;

/** Flatten a fetch rejection into one diagnosable line: undici rejects with
 * TypeError("fetch failed") and chains the real cause (ENOTFOUND,
 * ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT, self-signed certificate, …) on
 * `.cause` — the audit must name it, not the umbrella message. */
function describeFetchFailure(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    const code = (current as NodeJS.ErrnoException).code;
    parts.push(current.message + (typeof code === "string" ? ` (${code})` : ""));
    current = (current as { cause?: unknown }).cause;
  }
  return parts.length > 0 ? parts.join(": ") : "unknown network failure";
}

export async function sendTelegram(options: TelegramSendOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  let response: Response;
  try {
    response = await fetchImpl(`${TELEGRAM_API}/bot${options.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: options.chatId, text: options.text }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Telegram send failed (network): ${describeFetchFailure(error)}`);
  }
  if (!response.ok) {
    const failure = await upstreamFailure("Telegram", response);
    throw new Error(`${failure.message}: ${failure.bodySnippet}`);
  }
}
