import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  ExportFormat as PrismaExportFormat,
  ExportStatus as PrismaExportStatus,
  ExportType as PrismaExportType,
} from "../../generated/prisma/enums.js";

/**
 * Export audit trail — one immutable ExportAudit row per export run (type +
 * format + window + outcome). Mirrors tickets/activity.ts: pass a transaction
 * client to keep the entry atomic with the export it describes.
 */

export type ExportAuditClient = PrismaClient | Prisma.TransactionClient;

export type ExportAuditInput = {
  /** Null for system/scheduled exports; resolved to a display name on read. */
  actorId: string | null;
  type: PrismaExportType;
  format: PrismaExportFormat;
  from?: Date | null;
  to?: Date | null;
  status: PrismaExportStatus;
  rowCount?: number | null;
  error?: string | null;
};

/** Append one export audit entry. Fire-and-forget safe: never throws to the
 * caller's error path beyond a failed write. */
export function recordExportAudit(
  client: ExportAuditClient,
  input: ExportAuditInput,
): Promise<void> {
  return client.exportAudit
    .create({
      data: {
        actorId: input.actorId,
        type: input.type,
        format: input.format,
        from: input.from ?? null,
        to: input.to ?? null,
        status: input.status,
        rowCount: input.rowCount ?? null,
        error: input.error ?? null,
      },
      select: { id: true },
    })
    .then(() => undefined);
}

export type ExportAudit = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  type: PrismaExportType;
  format: PrismaExportFormat;
  from: string | null;
  to: string | null;
  status: PrismaExportStatus;
  rowCount: number | null;
  error: string | null;
  createdAt: string;
};

type ExportAuditRow = Prisma.ExportAuditGetPayload<{
  include: { actor: { select: { name: true } } };
}>;

export function toExportAuditDto(row: ExportAuditRow): ExportAudit {
  return {
    id: row.id,
    actorId: row.actorId,
    actorName: row.actor?.name ?? null,
    type: row.type,
    format: row.format,
    from: row.from?.toISOString() ?? null,
    to: row.to?.toISOString() ?? null,
    status: row.status,
    rowCount: row.rowCount,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}
