import type { Channel } from "../../generated/prisma/client.js";
import { decryptSecret, encryptSecret, maskKey } from "../../lib/crypto.js";
import type { Channel as ChannelWire, CreateChannelBody, UpdateChannelBody } from "./schema.js";

/**
 * Channel `target` column is a single JSON payload whose shape depends on the
 * channel type: WHATSAPP {chatId}, TELEGRAM {chatId, token(encrypted at rest)},
 * EMAIL {bcc[]}. This file is the only place that knows those shapes; the wire
 * view never exposes the raw Telegram token (CHN-02), only maskKey of it.
 */

type WhatsappTarget = { chatId: string };
type TelegramTarget = { chatId: string; token: string };
type EmailTarget = { bcc: string[] };

type DecodedTarget =
  | { type: "WHATSAPP"; chatId: string }
  | { type: "TELEGRAM"; chatId: string; token: string }
  | { type: "EMAIL"; bcc: string[] };

export function encodeChannelTarget(body: CreateChannelBody): string {
  switch (body.type) {
    case "WHATSAPP": {
      const target: WhatsappTarget = { chatId: body.chatId };
      return JSON.stringify(target);
    }
    case "TELEGRAM": {
      const target: TelegramTarget = { chatId: body.chatId, token: encryptSecret(body.token) };
      return JSON.stringify(target);
    }
    case "EMAIL": {
      const target: EmailTarget = { bcc: body.bcc };
      return JSON.stringify(target);
    }
  }
}

export function decodeChannelTarget(row: Channel): DecodedTarget {
  switch (row.type) {
    case "WHATSAPP": {
      const target = JSON.parse(row.target) as WhatsappTarget;
      return { type: "WHATSAPP", chatId: target.chatId };
    }
    case "TELEGRAM": {
      const target = JSON.parse(row.target) as TelegramTarget;
      return { type: "TELEGRAM", chatId: target.chatId, token: decryptSecret(target.token) };
    }
    case "EMAIL": {
      const target = JSON.parse(row.target) as EmailTarget;
      return { type: "EMAIL", bcc: target.bcc };
    }
  }
}

/** Wire DTO: TELEGRAM carries tokenMasked/hasToken only — never the raw token. */
export function toChannelWire(row: Channel): ChannelWire {
  const base = {
    id: row.id,
    clientId: row.clientId,
    active: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  switch (row.type) {
    case "WHATSAPP": {
      const target = JSON.parse(row.target) as WhatsappTarget;
      return { ...base, type: "WHATSAPP", chatId: target.chatId };
    }
    case "TELEGRAM": {
      const target = JSON.parse(row.target) as TelegramTarget;
      const token = decryptSecret(target.token);
      return { ...base, type: "TELEGRAM", chatId: target.chatId, tokenMasked: maskKey(token), hasToken: true };
    }
    case "EMAIL": {
      const target = JSON.parse(row.target) as EmailTarget;
      return { ...base, type: "EMAIL", bcc: target.bcc };
    }
  }
}

/** Merge a PATCH body into the stored target, respecting the channel's type:
 * chatId applies to WHATSAPP/TELEGRAM, token to TELEGRAM, bcc to EMAIL. */
export function applyChannelUpdate(row: Channel, body: UpdateChannelBody): { isActive?: boolean; target?: string } {
  const data: { isActive?: boolean; target?: string } = {};
  if (body.active !== undefined) {
    data.isActive = body.active;
  }
  const decoded = decodeChannelTarget(row);
  const token =
    decoded.type === "TELEGRAM" && body.token !== undefined ? encryptSecret(body.token) : undefined;
  if (decoded.type === "WHATSAPP" && body.chatId !== undefined) {
    data.target = JSON.stringify({ chatId: body.chatId } satisfies WhatsappTarget);
  } else if (decoded.type === "TELEGRAM" && (body.chatId !== undefined || token !== undefined)) {
    const target: TelegramTarget = {
      chatId: body.chatId ?? decoded.chatId,
      token: token ?? encryptSecret(decoded.token),
    };
    data.target = JSON.stringify(target);
  } else if (decoded.type === "EMAIL" && body.bcc !== undefined) {
    data.target = JSON.stringify({ bcc: body.bcc } satisfies EmailTarget);
  }
  return data;
}
