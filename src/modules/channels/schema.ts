import { z } from "zod/v4";
import { ChannelType as PrismaChannelType } from "../../generated/prisma/enums.js";

/** Per-client delivery channels. Mutations ADMIN/EDITOR. WAHA creds are
 * env-based (gateway-level); Telegram bot tokens are stored AES-256-GCM
 * encrypted and returned only masked. SMTP is central, not per channel. */

export const ChannelTypeEnum = z.enum(PrismaChannelType);
export type ChannelType = z.infer<typeof ChannelTypeEnum>;

export const emailField = z.email();

const baseChannel = {
  id: z.number().int().positive(),
  clientId: z.number().int().positive(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

/** Wire shape per type — discriminated so FE forms and senders stay total. */
export const ChannelSchema = z.discriminatedUnion("type", [
  z.object({
    ...baseChannel,
    type: z.literal("WHATSAPP"),
    /** WAHA group/chat id (external gateway session addresses it). */
    chatId: z.string().min(1),
  }),
  z.object({
    ...baseChannel,
    type: z.literal("TELEGRAM"),
    chatId: z.string().min(1),
    /** Never the raw token — masked form like "123456:AA…x9Z". */
    tokenMasked: z.string(),
    hasToken: z.boolean(),
  }),
  z.object({
    ...baseChannel,
    type: z.literal("EMAIL"),
    /** BCC destinations for this client (SMTP itself is central config). */
    bcc: z.array(emailField).min(1),
  }),
]);
export type Channel = z.infer<typeof ChannelSchema>;

// POST /clients/:clientId/channels
export const CreateChannelBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("WHATSAPP"),
    chatId: z.string().min(1),
  }),
  z.object({
    type: z.literal("TELEGRAM"),
    chatId: z.string().min(1),
    token: z.string().min(1),
  }),
  z.object({
    type: z.literal("EMAIL"),
    bcc: z.array(emailField).min(1),
  }),
]);
export type CreateChannelBody = z.infer<typeof CreateChannelBodySchema>;

// PATCH /channels/:id — active toggle + field updates (token optional replace)
export const UpdateChannelBodySchema = z
  .object({
    active: z.boolean().optional(),
    chatId: z.string().min(1).optional(),
    token: z.string().min(1).optional(),
    bcc: z.array(emailField).min(1).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field required" });
