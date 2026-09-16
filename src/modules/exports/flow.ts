import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  ExportStatus,
  ExportType as PrismaExportType,
  ExportFormat as PrismaExportFormat,
} from "../../generated/prisma/enums.js";
import type { ExportAuditInput } from "./audit.js";
import { dateBound } from "../tickets/schema.js";
import { createCsvFormatter } from "./formatters/csv.js";
import { createNdjsonFormatter } from "./formatters/ndjson.js";
import { formatXlsx } from "./formatters/xlsx.js";

/**
 * Centralized streaming export flow. runExport turns one validated export
 * request into an HTTP download: download headers, a PassThrough handed to
 * the reply, fetcher rows piped through the format-specific formatter, and
 * one SUCCESS/FAILED audit row written via recordExportAudit once the stream
 * settles. All collaborators come in through ExportDeps — the real wiring is
 * lazy so tests inject fakes without touching the Prisma client chain.
 */

/** One export row crossing the flow: the read-side detail shapes are
 * Record-shaped objects carrying a status (see ../schema.ts). */
export type ExportRow = Record<string, unknown>;

/** Minimal structural port over FastifyReply — a real reply satisfies it. */
export interface ExportReply {
  header(name: string, value: unknown): unknown;
  send(payload?: unknown): unknown;
}

/** Collaborators of one export run. Bounds are the wire-level date/datetime
 * strings already validated by CreateExportBodySchema. */
export interface ExportDeps {
  rows(
    type: PrismaExportType,
    from: string | undefined,
    to: string | undefined,
  ): AsyncIterable<ExportRow>;
  breakdown(
    type: PrismaExportType,
    from: string | undefined,
    to: string | undefined,
  ): Promise<Record<string, number>>;
  audit(input: ExportAuditInput): Promise<void>;
}

export interface ExportRequest {
  readonly type: PrismaExportType;
  readonly format: PrismaExportFormat;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly actor: { readonly id: string | null };
}

const FORMAT_META: Record<PrismaExportFormat, { readonly contentType: string; readonly extension: string }> = {
  [PrismaExportFormat.CSV]: { contentType: "text/csv; charset=utf-8", extension: "csv" },
  [PrismaExportFormat.JSON]: { contentType: "application/x-ndjson", extension: "ndjson" },
  [PrismaExportFormat.XLSX]: {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  },
};

function contentDisposition(
  type: PrismaExportType,
  format: PrismaExportFormat,
  from: string | undefined,
  to: string | undefined,
): string {
  const name = ["export", type.toLowerCase(), from ?? "all", to ?? "all"].join("-");
  return `attachment; filename*=UTF-8''${encodeURIComponent(`${name}.${FORMAT_META[format].extension}`)}`;
}

function auditBound(value: string | undefined, endOfDay: boolean): Date | null {
  return value === undefined ? null : dateBound(value, endOfDay);
}

async function* countedRows(
  source: AsyncIterable<ExportRow>,
  onRow: () => void,
): AsyncGenerator<ExportRow> {
  for await (const row of source) {
    onRow();
    yield row;
  }
}

async function pump(
  request: ExportRequest,
  rows: AsyncIterable<ExportRow>,
  deps: ExportDeps,
  sink: PassThrough,
): Promise<void> {
  const { type, format, from, to } = request;
  switch (format) {
    case PrismaExportFormat.CSV:
      await pipeline(rows, createCsvFormatter(), sink);
      return;
    case PrismaExportFormat.JSON:
      await pipeline(rows, createNdjsonFormatter(), sink);
      return;
    case PrismaExportFormat.XLSX: {
      const breakdown = await deps.breakdown(type, from, to);
      await pipeline(await formatXlsx({ type, rows, breakdown }), sink);
      return;
    }
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported export format: ${String(exhaustive)}`);
    }
  }
}

/**
 * Stream one export to the client and audit its outcome.
 *
 * Headers go out, the sink is handed to the reply, then rows stream through
 * the format-specific formatter. The promise resolves once the stream has
 * settled and the audit row was written. Failures after the headers were
 * sent cannot change the status — the sink is destroyed (aborting the
 * response) and the outcome lands in the FAILED audit row, which is the
 * caller-visible error surface.
 */
export async function runExport(
  request: ExportRequest,
  reply: ExportReply,
  deps?: ExportDeps,
): Promise<void> {
  const exportDeps = deps ?? (await realDeps());
  const { type, format, from, to, actor } = request;
  const sink = new PassThrough();
  reply.header("Content-Type", FORMAT_META[format].contentType);
  reply.header("Content-Disposition", contentDisposition(type, format, from, to));
  reply.send(sink);

  let rowCount = 0;
  try {
    await pump(
      request,
      countedRows(exportDeps.rows(type, from, to), () => (rowCount += 1)),
      exportDeps,
      sink,
    );
    await exportDeps.audit({
      actorId: actor.id,
      type,
      format,
      from: auditBound(from, false),
      to: auditBound(to, true),
      status: ExportStatus.SUCCESS,
      rowCount,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sink.destroy(error instanceof Error ? error : new Error(message));
    await exportDeps.audit({
      actorId: actor.id,
      type,
      format,
      from: auditBound(from, false),
      to: auditBound(to, true),
      status: ExportStatus.FAILED,
      rowCount,
      error: message,
    });
  }
}

/** All-time bounds for TICKET exports whose window is unbounded (the ticket
 * fetcher takes concrete Dates). */
const ALL_TIME_FROM = new Date(0);
const ALL_TIME_TO = new Date("9999-12-31T23:59:59.999Z");

function ticketBound(value: string | undefined, endOfDay: boolean): Date {
  if (value !== undefined) {
    return dateBound(value, endOfDay);
  }
  return endOfDay ? ALL_TIME_TO : ALL_TIME_FROM;
}

/**
 * Production wiring: the real fetchers, breakdown queries and the prisma
 * audit writer. Loaded through dynamic import so unit tests injecting fakes
 * never evaluate the Prisma client chain (lib/db throws without
 * DATABASE_URL at import time).
 */
async function realDeps(): Promise<ExportDeps> {
  const [{ iterateFeedExportRows, feedStatusBreakdown }, { iterateTicketExportRows, ticketStatusBreakdown }, { recordExportAudit }, { prisma }] =
    await Promise.all([
      import("./feedData.js"),
      import("./ticketData.js"),
      import("./audit.js"),
      import("../../lib/db.js"),
    ]);
  return {
    rows: (type, from, to) =>
      type === PrismaExportType.FEED
        ? iterateFeedExportRows(from, to)
        : iterateTicketExportRows(ticketBound(from, false), ticketBound(to, true)),
    breakdown: async (type, from, to) => {
      const partial =
        type === PrismaExportType.FEED
          ? await feedStatusBreakdown(from, to)
          : await ticketStatusBreakdown(ticketBound(from, false), ticketBound(to, true));
      const counts: Record<string, number> = {};
      for (const [status, count] of Object.entries(partial)) {
        if (count !== undefined) {
          counts[status] = count;
        }
      }
      return counts;
    },
    audit: (input) => recordExportAudit(prisma, input),
  };
}
