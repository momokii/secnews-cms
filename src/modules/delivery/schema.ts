import { z } from "zod/v4";
import { DeliveryStatus as PrismaDeliveryStatus } from "../../generated/prisma/enums.js";
import { paginated } from "../../common/pagination.js";
import { TicketSchema } from "../tickets/schema.js";
import { ChannelTypeEnum } from "../channels/schema.js";

/** Send endpoint + audit trail. Role ADMIN/EDITOR. Guards: ticket READY
 * (else 422 VALIDATION), zero PENDING suggestions (409 PENDING_SUGGESTIONS),
 * explicit inactive channelIds rejected (409 INACTIVE_TARGET) while `all`
 * silently includes only ACTIVE channels. One DeliveryAudit row per target. */

// POST /tickets/:id/send
export const SendBodySchema = z
  .object({
    /** Explicit targets — every id must exist AND be active. */
    channelIds: z.array(z.number().int().positive()).min(1).optional(),
    /** Shortcut: all currently-ACTIVE channels. */
    all: z.boolean().optional(),
  })
  .refine(
    (body) => (body.channelIds !== undefined) !== (body.all === true),
    { message: "Exactly one of channelIds or all required" },
  );
export type SendBody = z.infer<typeof SendBodySchema>;

export const DeliveryStatusEnum = z.enum(PrismaDeliveryStatus);
export type DeliveryStatus = z.infer<typeof DeliveryStatusEnum>;

export const DeliveryAuditSchema = z.object({
  id: z.number().int().positive(),
  ticketId: z.number().int().positive(),
  channelId: z.number().int().positive(),
  channelType: ChannelTypeEnum,
  clientId: z.number().int().positive(),
  clientName: z.string(),
  /** Concrete destination: chatId or bcc summary. */
  target: z.string(),
  /** Exact message body sent — compliance requirement, not truncation. */
  payload: z.string(),
  status: DeliveryStatusEnum,
  errorDetail: z.string().nullable(),
  sentById: z.number().int().positive(),
  sentAt: z.iso.datetime(),
});
export type DeliveryAudit = z.infer<typeof DeliveryAuditSchema>;

export const SendResponseSchema = z.object({
  ticket: TicketSchema,
  audit: z.array(DeliveryAuditSchema),
});

// GET /tickets/:id/delivery-audit
export const ListDeliveryAuditResponseSchema = paginated(DeliveryAuditSchema);
