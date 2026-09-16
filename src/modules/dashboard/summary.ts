import { prisma } from "../../lib/db.js";
import { dateBound } from "../tickets/schema.js";
import type { DateRangeQuery, SummaryResponse } from "./schema.js";

/** GET /dashboard/summary query layer. Five independent aggregates (two
 * counts, three status group-bys) run as one parallel batch transaction;
 * date-only bounds widen to UTC day edges via dateBound, and byStatus maps
 * stay sparse — statuses with zero rows are absent. */

type StatusRow<S extends string> = { status: S; _count: { _all: number } };

/** groupBy rows to a partial per-status count map. */
function tally<S extends string>(rows: StatusRow<S>[]): Partial<Record<S, number>> {
  const counts: Partial<Record<S, number>> = {};
  for (const row of rows) {
    counts[row.status] = row._count._all;
  }
  return counts;
}

export async function dashboardSummary({ from, to }: DateRangeQuery): Promise<SummaryResponse> {
  const createdAt = {
    ...(from === undefined ? {} : { gte: dateBound(from, false) }),
    ...(to === undefined ? {} : { lte: dateBound(to, true) }),
  };

  // groupBy promises are built outside the $transaction array: the delegate's
  // conditional return type only infers on the direct call site.
  const feedItemStatusP = prisma.feedItem.groupBy({
    by: ["status"],
    where: { createdAt },
    _count: { _all: true },
  });
  const ticketStatusP = prisma.ticket.groupBy({
    by: ["status"],
    where: { createdAt },
    _count: { _all: true },
  });
  const deliveryStatusP = prisma.deliveryAudit.groupBy({
    by: ["status"],
    where: { createdAt },
    _count: { _all: true },
  });

  const [feedItemTotal, feedItemRows, ticketTotal, ticketRows, deliveryRows] =
    await prisma.$transaction([
      prisma.feedItem.count({ where: { createdAt } }),
      feedItemStatusP,
      prisma.ticket.count({ where: { createdAt } }),
      ticketStatusP,
      deliveryStatusP,
    ]);

  const deliveryCounts = tally(deliveryRows);
  return {
    feedItems: { total: feedItemTotal, byStatus: tally(feedItemRows) },
    tickets: { total: ticketTotal, byStatus: tally(ticketRows) },
    deliveries: {
      sent: deliveryCounts["SENT"] ?? 0,
      failed: deliveryCounts["FAILED"] ?? 0,
    },
  };
}
