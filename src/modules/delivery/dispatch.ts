import type { Channel } from "../../generated/prisma/client.js";
import { decodeChannelTarget } from "../channels/map.js";
import { sendEmail } from "./senders/email.js";
import { sendTelegram } from "./senders/telegram.js";
import { sendWhatsApp } from "./senders/waha.js";

/** Routes one bulletin payload to its channel via the matching sender
 * (SND-P-01…03). Senders receive no credentials from the wire: WhatsApp uses
 * the env-configured WAHA gateway, Telegram the stored decrypted bot token,
 * EMAIL the central SMTP relay with the channel's BCC list. */

/** Human-audit destination summary: chatId, or the BCC list joined. */
export function channelTargetSummary(row: Channel): string {
  const decoded = decodeChannelTarget(row);
  switch (decoded.type) {
    case "WHATSAPP":
    case "TELEGRAM":
      return decoded.chatId;
    case "EMAIL":
      return decoded.bcc.join(",");
  }
}

export async function deliverToChannel(
  row: Channel,
  subject: string,
  payload: string,
): Promise<void> {
  const decoded = decodeChannelTarget(row);
  switch (decoded.type) {
    case "WHATSAPP":
      return sendWhatsApp({ chatId: decoded.chatId, text: payload });
    case "TELEGRAM":
      return sendTelegram({ token: decoded.token, chatId: decoded.chatId, text: payload });
    case "EMAIL":
      return sendEmail({ bcc: decoded.bcc, subject, text: payload });
  }
}
