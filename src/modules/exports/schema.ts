import { z } from "zod/v4";
import {
  ExportType as PrismaExportType,
  ExportFormat as PrismaExportFormat,
  ExportStatus as PrismaExportStatus,
} from "../../generated/prisma/enums.js";
import { paginated, pageQuery } from "../../common/pagination.js";
import { dateBound, TicketDetailSchema } from "../tickets/schema.js";
import { FeedItemDetailSchema } from "../feeds/schema.js";

/** Export run contracts + audit trail. Rows reuse the read-side detail
 * shapes so exports serialize exactly what the detail endpoints return. */

// ---- Canonical enums (derived from the generated Prisma client) ----

/** FEED exports dump feed-item details; TICKET exports dump ticket details. */
export const ExportTypeEnum = z.enum(PrismaExportType);
export type ExportType = z.infer<typeof ExportTypeEnum>;

export const ExportFormatEnum = z.enum(PrismaExportFormat);
export type ExportFormat = z.infer<typeof ExportFormatEnum>;

export const ExportStatusEnum = z.enum(PrismaExportStatus);
export type ExportStatus = z.infer<typeof ExportStatusEnum>;

// ---- Export rows ----

/** Full ticket export row: detail incl nested sources + iocs. */
export const TicketExportRowSchema = TicketDetailSchema;
export type TicketExportRow = z.infer<typeof TicketExportRowSchema>;

/** Full feed-item export row: detail incl verbatim raw payload + source name. */
export const FeedExportRowSchema = FeedItemDetailSchema;
export type FeedExportRow = z.infer<typeof FeedExportRowSchema>;

// ---- Requests ----

/** POST /exports { format, from?, to? } — bounds optional, inclusive when set. */
export const CreateExportBodySchema = z
  .object({
    format: ExportFormatEnum,
    from: z.union([z.iso.date(), z.iso.datetime()]).optional(),
    to: z.union([z.iso.date(), z.iso.datetime()]).optional(),
  })
  .refine(
    ({ from, to }) =>
      from === undefined || to === undefined || dateBound(from, false) <= dateBound(to, true),
    { message: "from must be before or equal to to", path: ["from"] },
  );
export type CreateExportBody = z.infer<typeof CreateExportBodySchema>;

// ---- Audit trail ----

/** Wire shape of one export run. actorId/actorName are nullable — system or
 * scheduled exports have no user, and deleting the user keeps the row. */
export const ExportAuditSchema = z.object({
  id: z.uuid(),
  actorId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  type: ExportTypeEnum,
  format: ExportFormatEnum,
  from: z.iso.datetime().nullable(),
  to: z.iso.datetime().nullable(),
  status: ExportStatusEnum,
  rowCount: z.number().int().min(0).nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ExportAudit = z.infer<typeof ExportAuditSchema>;

// ---- Audit list ----

export const ListExportAuditQuerySchema = pageQuery.extend({
  type: ExportTypeEnum.optional(),
  format: ExportFormatEnum.optional(),
  status: ExportStatusEnum.optional(),
  from: z.union([z.iso.date(), z.iso.datetime()]).optional(),
  to: z.union([z.iso.date(), z.iso.datetime()]).optional(),
}).refine(
  ({ from, to }) =>
    from === undefined || to === undefined || dateBound(from, false) <= dateBound(to, true),
  { message: "from must be before or equal to to", path: ["from"] },
);

export const ListExportAuditResponseSchema = paginated(ExportAuditSchema);
