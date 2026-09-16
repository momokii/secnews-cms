import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/db.js";
import { dateBound } from "../tickets/schema.js";
import type { TimeseriesQuery, TimeseriesResponse } from "./schema.js";

/** GET /dashboard/timeseries query layer. Three $queryRaw aggregates bucket
 * feedItems/tickets/deliveries by Jakarta-local day via
 * date_trunc('day', createdAt AT TIME ZONE 'Asia/Jakarta'). Prisma stores
 * DateTime as `timestamp` (UTC wall clock), so bounds are passed as UTC ISO
 * strings cast to `timestamp` and the column is normalized through
 * AT TIME ZONE 'UTC' first. Days with no rows are zero-filled in TS from the
 * requested range; without a bound the observed min/max day stands in. */

type DayCountRow = { day: string; count: number };

/** Fixed +07:00 (WIB) renders a Jakarta day as its UTC-midnight instant;
 * Jakarta has no DST so the offset never shifts. */
const JAKARTA_OFFSET = "+07:00";
const DAY_MS = 86_400_000;

const jakartaDayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });

/** UTC instant -> Jakarta-local YYYY-MM-DD. */
function jakartaDay(instant: Date): string {
  return jakartaDayFormatter.format(instant);
}

/** Jakarta day label -> UTC-midnight epoch ms (bucket arithmetic runs in UTC). */
function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/** Jakarta day label -> bucket instant (UTC ISO of Jakarta midnight). */
function bucketInstant(day: string): string {
  return new Date(`${day}T00:00:00.000${JAKARTA_OFFSET}`).toISOString();
}

/** Dense ordered day list from the requested range, falling back on each
 * unbounded side to the earliest/latest day seen across all three tables. */
function bucketDays(
  rowSets: DayCountRow[][],
  from: string | undefined,
  to: string | undefined,
): string[] {
  const observed = rowSets.flat().map((row) => row.day).toSorted();
  const first = from === undefined ? observed[0] : jakartaDay(dateBound(from, false));
  const last = to === undefined ? observed.at(-1) : jakartaDay(dateBound(to, true));
  if (first === undefined || last === undefined) return [];
  const days: string[] = [];
  for (let ms = dayStart(first); ms <= dayStart(last); ms += DAY_MS) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

function bucketCounts(
  table: "FeedItem" | "Ticket" | "DeliveryAudit",
  from: string | undefined,
  to: string | undefined,
): Prisma.PrismaPromise<DayCountRow[]> {
  const conditions: Prisma.Sql[] = [];
  if (from !== undefined) {
    conditions.push(Prisma.sql`"createdAt" >= ${dateBound(from, false).toISOString()}::timestamp`);
  }
  if (to !== undefined) {
    conditions.push(Prisma.sql`"createdAt" <= ${dateBound(to, true).toISOString()}::timestamp`);
  }
  const where =
    conditions.length === 0 ? Prisma.empty : Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  return prisma.$queryRaw<DayCountRow[]>`
    SELECT to_char(
             date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta'),
             'YYYY-MM-DD'
           ) AS day,
           count(*)::int AS count
    FROM ${Prisma.raw(`"${table}"`)}
    ${where}
    GROUP BY day
    ORDER BY day`;
}

export async function dashboardTimeseries({ from, to }: TimeseriesQuery): Promise<TimeseriesResponse> {
  const [feedItemRows, ticketRows, deliveryRows] = await prisma.$transaction([
    bucketCounts("FeedItem", from, to),
    bucketCounts("Ticket", from, to),
    bucketCounts("DeliveryAudit", from, to),
  ]);

  const days = bucketDays([feedItemRows, ticketRows, deliveryRows], from, to);
  const feedItemByDay = new Map(feedItemRows.map(({ day, count }) => [day, count]));
  const ticketByDay = new Map(ticketRows.map(({ day, count }) => [day, count]));
  const deliveryByDay = new Map(deliveryRows.map(({ day, count }) => [day, count]));

  return {
    buckets: days.map((day) => ({
      bucket: bucketInstant(day),
      feedItems: feedItemByDay.get(day) ?? 0,
      tickets: ticketByDay.get(day) ?? 0,
      deliveries: deliveryByDay.get(day) ?? 0,
    })),
  };
}
