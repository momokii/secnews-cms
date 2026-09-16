import { z } from "zod/v4";
import type { Prisma } from "../../generated/prisma/client.js";
import { SuggestionStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/db.js";
import { DeliveryAuditSchema } from "../delivery/schema.js";
import { toDeliveryAuditWire } from "../delivery/send.routes.js";
import { toTicketActivityDto, TicketActivitySchema } from "../tickets/activity.js";
import { toIocDto, toTicketDto, toTicketSourceDto } from "../tickets/mappers.js";
import { TicketExportRowSchema } from "./schema.js";
import type { TicketStatus } from "../tickets/schema.js";
import { recentActivityTakenBy } from "../tickets/taken-by.js";

/**
 * Ticket export data layer. Rows reuse the read-side detail shape
 * (TicketExportRow: ticket + nested sources + iocs + pendingSuggestions)
 * extended with the audit trail (activities) and the delivery history
 * (deliveryAudits), so exports serialize what the detail endpoints return
 * plus their history — actor names and client names joined.
 */

/** Wire shape of one TICKET export row. */
export const TicketExportDataRowSchema = TicketExportRowSchema.extend({
  activities: z.array(TicketActivitySchema),
  deliveryAudits: z.array(DeliveryAuditSchema),
});
export type TicketExportDataRow = z.infer<typeof TicketExportDataRowSchema>;

/** Per-status ticket counts as produced by a group-by — statuses with zero
 * rows are absent rather than zero-filled (same shape as the dashboard). */
export type TicketStatusBreakdown = Partial<Record<TicketStatus, number>>;

const TICKET_EXPORT_BATCH = 200;

const ticketExportInclude = {
  takenBy: { select: { name: true } },
  sources: { orderBy: { createdAt: "asc" as const } },
  iocs: { orderBy: { createdAt: "asc" as const } },
  activities: {
    include: { actor: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  },
  deliveries: {
    include: { channel: { include: { client: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" as const },
  },
  _count: { select: { suggestions: { where: { status: SuggestionStatus.PENDING } } } },
} satisfies Prisma.TicketInclude;

type TicketExportDbRow = Prisma.TicketGetPayload<{ include: typeof ticketExportInclude }>;

function toTicketExportDataRow(
  row: TicketExportDbRow,
  fallbackTakenByName: string | null,
): TicketExportDataRow {
  return {
    ...toTicketDto(row, fallbackTakenByName),
    sources: row.sources.map(toTicketSourceDto),
    iocs: row.iocs.map(toIocDto),
    activities: row.activities.map(toTicketActivityDto),
    deliveryAudits: row.deliveries.map(toDeliveryAuditWire),
    pendingSuggestions: row._count.suggestions,
  };
}

/**
 * Walk every ticket created in the [from, to] window (inclusive bounds),
 * oldest first, yielding full export rows batch by batch so a large window
 * never materializes in memory. Legacy rows without a takenBy relation fall
 * back to the most recent TAKEN/CREATED activity actor — the same resolution
 * the list/detail endpoints apply.
 */
export async function* iterateTicketExportRows(
  from: Date,
  to: Date,
): AsyncGenerator<TicketExportDataRow> {
  const where: Prisma.TicketWhereInput = { createdAt: { gte: from, lte: to } };
  let skip = 0;
  for (;;) {
    const rows = await prisma.ticket.findMany({
      where,
      include: ticketExportInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: TICKET_EXPORT_BATCH,
    });
    if (rows.length === 0) {
      return;
    }
    const fallbackNames = await recentActivityTakenBy(prisma, rows.map((row) => row.id));
    for (const row of rows) {
      yield toTicketExportDataRow(row, fallbackNames.get(row.id) ?? null);
    }
    if (rows.length < TICKET_EXPORT_BATCH) {
      return;
    }
    skip += rows.length;
  }
}

/** Group-count the tickets created in the [from, to] window by status. */
export async function ticketStatusBreakdown(
  from: Date,
  to: Date,
): Promise<TicketStatusBreakdown> {
  const groups = await prisma.ticket.groupBy({
    by: ["status"],
    where: { createdAt: { gte: from, lte: to } },
    _count: { _all: true },
  });
  const breakdown: TicketStatusBreakdown = {};
  for (const group of groups) {
    breakdown[group.status] = group._count._all;
  }
  return breakdown;
}
