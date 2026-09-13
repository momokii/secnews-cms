import { z } from "zod/v4";
import {
  TicketStatus as PrismaTicketStatus,
  TicketOrigin as PrismaTicketOrigin,
  FindingType as PrismaFindingType,
  TlpLevel as PrismaTlpLevel,
  IocType as PrismaIocType,
  SuggestionStatus as PrismaSuggestionStatus,
} from "../../generated/prisma/enums.js";
import { paginated, pageQuery } from "../../common/pagination.js";

/** Ticket workflow contract. State machine + role gates are pinned in
 * docs/STATES.md — this file is the wire-level mirror only. */

// ---- Canonical enums (derived from the generated Prisma client) ----

/** OPEN → RESEARCH → READY → SENT → CLOSED; cancel OPEN|RESEARCH|READY → CLOSED. */
export const TicketStatusEnum = z.enum(PrismaTicketStatus);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

export const TicketOriginEnum = z.enum(PrismaTicketOrigin);
export type TicketOrigin = z.infer<typeof TicketOriginEnum>;

export const FindingTypeEnum = z.enum(PrismaFindingType);
export type FindingType = z.infer<typeof FindingTypeEnum>;

export const TlpEnum = z.enum(PrismaTlpLevel);
export type Tlp = z.infer<typeof TlpEnum>;

/** 12 confirmed IOC types. */
export const IocTypeEnum = z.enum(PrismaIocType);
export type IocType = z.infer<typeof IocTypeEnum>;

export const SuggestionStatusEnum = z.enum(PrismaSuggestionStatus);
export type SuggestionStatus = z.infer<typeof SuggestionStatusEnum>;

// ---- Entities ----

const cveId = z.string().regex(/^CVE-\d{4}-\d{4,}$/, "CVE-YYYY-NNNNN");

export const TicketSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  origin: TicketOriginEnum,
  findingType: FindingTypeEnum,
  status: TicketStatusEnum,
  /** Structured, finding-type-specific fields (validated on write). */
  cveIds: z.array(cveId).default([]),
  affectedProduct: z.string().nullable(),
  affectedVersions: z.string().nullable(),
  mitigation: z.string().nullable(),
  threatName: z.string().nullable(),
  /** Final (client-facing) output fields — distinct from working materials. */
  overview: z.string().nullable(),
  description: z.string().nullable(),
  recommendations: z.string().nullable(),
  references: z.array(z.url()).default([]),
  tlp: TlpEnum.default("AMBER"),
  feedItemId: z.number().int().positive().nullable(),
  otxPulseId: z.string().nullable(),
  otxPulseUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const TicketSourceSchema = z.object({
  id: z.number().int().positive(),
  ticketId: z.number().int().positive(),
  url: z.url().nullable(),
  note: z.string().nullable(),
  createdById: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export type TicketSource = z.infer<typeof TicketSourceSchema>;

export const IocSchema = z.object({
  id: z.number().int().positive(),
  ticketId: z.number().int().positive(),
  type: IocTypeEnum,
  value: z.string().min(1).max(512),
  context: z.string().nullable(),
  origin: z.string().nullable(),
  includeInBulletin: z.boolean(),
  createdById: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export type Ioc = z.infer<typeof IocSchema>;

export const TicketDetailSchema = TicketSchema.extend({
  sources: z.array(TicketSourceSchema),
  iocs: z.array(IocSchema),
  /** Drives the FE hard-block banner (S2); >0 must disable Send/OTX. */
  pendingSuggestions: z.number().int().min(0),
});
export type TicketDetail = z.infer<typeof TicketDetailSchema>;

// ---- Requests ----

/** Type-specific structured fields are required exactly where they apply. */
export const CreateTicketBodySchema = z.discriminatedUnion("findingType", [
  z.object({
    findingType: z.literal("VULNERABILITY_CVE"),
    title: z.string().min(1),
    cveIds: z.array(cveId).min(1),
    affectedProduct: z.string().min(1),
    affectedVersions: z.string().min(1),
    mitigation: z.string().optional(),
  }),
  z.object({
    findingType: z.literal("THREAT_CAMPAIGN"),
    title: z.string().min(1),
    threatName: z.string().min(1),
  }),
  z.object({
    findingType: z.literal("OTHER"),
    title: z.string().min(1),
  }),
]);
export type CreateTicketBody = z.infer<typeof CreateTicketBodySchema>;

/** Working metadata only — final output fields use PATCH below. */
export const UpdateTicketBodySchema = z
  .object({ title: z.string().min(1).optional() })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field required" });

/** POST /tickets/:id/transition { to } — legality + role gate per STATES.md.
 * Illegal transition → 422 VALIDATION; wrong role → 403; `to: SENT` with
 * PENDING suggestions → 409 PENDING_SUGGESTIONS. */
export const TransitionBodySchema = z.object({
  to: TicketStatusEnum,
});

/** PATCH final output fields (any subset). tlp defaults AMBER on create. */
export const PatchTicketFieldsBodySchema = z
  .object({
    title: z.string().min(1).optional(),
    overview: z.string().optional(),
    description: z.string().optional(),
    recommendations: z.string().optional(),
    references: z.array(z.url()).optional(),
    tlp: TlpEnum.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field required" });
export type PatchTicketFieldsBody = z.infer<typeof PatchTicketFieldsBodySchema>;

// ---- Sources ----

export const CreateTicketSourceBodySchema = z
  .object({
    url: z.url().optional(),
    note: z.string().min(1).optional(),
  })
  .refine((body) => body.url !== undefined || body.note !== undefined, {
    message: "url or note required",
  });

// ---- IOCs ----

export const CreateIocBodySchema = z.object({
  type: IocTypeEnum,
  value: z.string().min(1).max(512),
  context: z.string().optional(),
  origin: z.string().optional(),
  includeInBulletin: z.boolean().default(true),
});
export type CreateIocBody = z.infer<typeof CreateIocBodySchema>;

export const UpdateIocBodySchema = z
  .object({
    value: z.string().min(1).max(512).optional(),
    context: z.string().optional(),
    origin: z.string().optional(),
    includeInBulletin: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field required" });

// ---- List ----

export const ListTicketsQuerySchema = pageQuery.extend({
  q: z.string().min(1).optional(),
  status: TicketStatusEnum.optional(),
  origin: TicketOriginEnum.optional(),
  findingType: FindingTypeEnum.optional(),
});
export const ListTicketsResponseSchema = paginated(TicketSchema);
