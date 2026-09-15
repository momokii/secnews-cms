import { defaultFetch, type FetchLike } from "../../ai/providers/types.js";
import { upstreamFailure } from "../../../common/upstream.js";

/**
 * Telegram Bot API adapter (SND-P-02): POST
 * https://api.telegram.org/bot<token>/sendMessage with {chat_id, text}.
 * The bot token travels only to api.telegram.org; tests inject fetchImpl.
 * Rejections carry the truncated upstream body (TASK-RESEND) so the
 * DeliveryAudit error column names the real reason (e.g. Telegram's
 * 429 "Too Many Requests: retry after N").
 */

export type TelegramSendOptions = {
  token: string;
  chatId: string;
  text: string;
  fetchImpl?: FetchLike;
};

const TELEGRAM_API = "https://api.telegram.org";

export async function sendTelegram(options: TelegramSendOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const response = await fetchImpl(`${TELEGRAM_API}/bot${options.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: options.chatId, text: options.text }),
  });
  if (!response.ok) {
    const failure = await upstreamFailure("Telegram", response);
    throw new Error(`${failure.message}: ${failure.bodySnippet}`);
  }
}
