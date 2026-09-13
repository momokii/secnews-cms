import { defaultFetch, upstreamError, type FetchLike } from "../../ai/providers/types.js";

/**
 * Telegram Bot API adapter (SND-P-02): POST
 * https://api.telegram.org/bot<token>/sendMessage with {chat_id, text}.
 * The bot token travels only to api.telegram.org; tests inject fetchImpl.
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
    throw upstreamError("Telegram", response.status);
  }
}
