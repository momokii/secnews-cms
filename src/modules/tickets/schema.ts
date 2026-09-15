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
import { CVE_ID_PATTERN, iocValueProblem } from "./validation.js";

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
// Ids mirror the Prisma uuid string PKs (B1 authoritative), same as auth/feeds modules.

/** Read-side shape: every stored cveIds entry matches the canonical CVE id
 * (a stray "N/A" once 500'd every tickets read). Request writes re-check via
 * validation.ts so rejections are 422 VALIDATION naming the bad value. */
const cveId = z.string().regex(CVE_ID_PATTERN, "CVE-YYYY-NNNNN");

export const TicketSchema = z.object({
  id: z.uuid(),
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
  feedItemId: z.uuid().nullable(),
  otxPulseId: z.string().nullable(),
  otxPulseUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  takenByName: z.string().nullable(),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const TicketSourceSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  url: z.url().nullable(),
  note: z.string().nullable(),
  createdById: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type TicketSource = z.infer<typeof TicketSourceSchema>;

export const IocSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  type: IocTypeEnum,
  value: z.string().min(1).max(512),
  context: z.string().nullable(),
  origin: z.string().nullable(),
  includeInBulletin: z.boolean(),
  createdById: z.uuid().nullable(),
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

/** Quick-capture create: only title (+ findingType) is truly required.
 * Type-specific structured fields and the working summary are optional at
 * create — the dialog captures them minimally and they are filled later
 * (working metadata, unlike the final output fields). */
export const CreateTicketBodySchema = z.discriminatedUnion("findingType", [
  z.object({
    findingType: z.literal("VULNERABILITY_CVE"),
    title: z.string().min(1),
    summary: z.string().optional(),
    /** Entries re-checked in the route so garbage answers 422 naming the value. */
    cveIds: z.array(z.string()).optional(),
    affectedProduct: z.string().min(1).optional(),
    affectedVersions: z.string().min(1).optional(),
    mitigation: z.string().optional(),
  }),
  z.object({
    findingType: z.literal("THREAT_CAMPAIGN"),
    title: z.string().min(1),
    summary: z.string().optional(),
    threatName: z.string().min(1).optional(),
  }),
  z.object({
    findingType: z.literal("OTHER"),
    title: z.string().min(1),
    summary: z.string().optional(),
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

/** PATCH final output fields (any subset). tlp defaults AMBER on create;
 * cveIds entries are re-checked in the route (422 naming the bad value). */
export const PatchTicketFieldsBodySchema = z
  .object({
    title: z.string().min(1).optional(),
    overview: z.string().optional(),
    description: z.string().optional(),
    recommendations: z.string().optional(),
    references: z.array(z.url()).optional(),
    cveIds: z.array(z.string()).optional(),
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

export const CreateIocBodySchema = z
  .object({
    type: IocTypeEnum,
    value: z.string().min(1).max(512),
    context: z.string().optional(),
    origin: z.string().optional(),
    includeInBulletin: z.boolean().default(true),
  })
  .superRefine(({ type, value }, ctx) => {
    const problem = iocValueProblem(type, value);
    if (problem !== null) {
      ctx.addIssue({ code: "custom", message: problem, path: ["value"] });
    }
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

export const UuidIdParamSchema = z.object({ id: z.uuid() });
export const IocIdParamSchema = z.object({ id: z.uuid(), iocId: z.uuid() });
export const SourceIdParamSchema = z.object({ id: z.uuid(), sourceId: z.uuid() });

// ---- List ----

export const ListTicketsQuerySchema = pageQuery.extend({
  q: z.string().min(1).optional(),
  status: TicketStatusEnum.optional(),
  origin: TicketOriginEnum.optional(),
  findingType: FindingTypeEnum.optional(),
  from: z.union([z.iso.date(), z.iso.datetime()]).optional(),
  to: z.union([z.iso.date(), z.iso.datetime()]).optional(),
}).refine(
  ({ from, to }) =>
    from === undefined || to === undefined || dateBound(from, false) <= dateBound(to, true),
  { message: "from must be before or equal to to", path: ["from"] },
);

/** Parse a list-query bound: date-only means start/end of that UTC day. */
export function dateBound(value: string, endOfDay: boolean): Date {
  return value.length === 10
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(value);
}
export const ListTicketsResponseSchema = paginated(TicketSchema);
