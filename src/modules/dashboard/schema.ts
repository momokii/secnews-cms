import { z } from "zod/v4";
import {
  DeliveryStatus as PrismaDeliveryStatus,
  FeedItemStatus as PrismaFeedItemStatus,
  TicketStatus as PrismaTicketStatus,
} from "../../generated/prisma/enums.js";

/** Read-only analytics contracts (GET /dashboard/*). Queries carry an
 * optional inclusive from/to range (date or full datetime); responses are
 * aggregate counts only — no row payload leaves this module. */

export const FeedItemStatusEnum = z.enum(PrismaFeedItemStatus);
export type FeedItemStatus = z.infer<typeof FeedItemStatusEnum>;

export const TicketStatusEnum = z.enum(PrismaTicketStatus);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

export const DeliveryStatusEnum = z.enum(PrismaDeliveryStatus);
export type DeliveryStatus = z.infer<typeof DeliveryStatusEnum>;

const count = z.number().int().nonnegative();

/** Per-status counts as produced by a group-by — statuses with zero rows are
 * absent rather than zero-filled. */
const byStatus = <K extends z.core.$ZodEnum>(status: K) =>
  z.partialRecord(status, count);

/** Bounds are date-only (expanded to full day by the query layer) or exact
 * datetimes; both optional, but from must not land after to. */
const dateBoundSchema = z.union([z.iso.date(), z.iso.datetime()]);

const DateRangeQueryObjectSchema = z.object({
  from: dateBoundSchema.optional(),
  to: dateBoundSchema.optional(),
});

function rangeOrdered({
  from,
  to,
}: {
  from?: string | undefined;
  to?: string | undefined;
}): boolean {
  return (
    from === undefined || to === undefined || dateBound(from, false) <= dateBound(to, true)
  );
}

/** Date-like string widened to a comparable instant; date-only bounds use UTC
 * day edges so `from=2026-01-01, to=2026-01-01` stays a valid one-day range. */
function dateBound(value: string, endOfDay: boolean): Date {
  return value.length === 10
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(value);
}

export const DateRangeQuerySchema = DateRangeQueryObjectSchema.refine(rangeOrdered, {
  message: "from must be before or equal to to",
  path: ["from"],
});
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;

export const SummaryResponseSchema = z.object({
  feedItems: z.object({ total: count, byStatus: byStatus(FeedItemStatusEnum) }),
  tickets: z.object({ total: count, byStatus: byStatus(TicketStatusEnum) }),
  deliveries: z.object({ sent: count, failed: count }),
});
export type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

export const TimeseriesIntervalEnum = z.enum(["day"]);
export type TimeseriesInterval = z.infer<typeof TimeseriesIntervalEnum>;

export const TimeseriesQuerySchema = DateRangeQueryObjectSchema.extend({
  interval: TimeseriesIntervalEnum.default("day"),
}).refine(rangeOrdered, { message: "from must be before or equal to to", path: ["from"] });
export type TimeseriesQuery = z.infer<typeof TimeseriesQuerySchema>;

export const TimeseriesBucketSchema = z.object({
  /** Bucket start instant (UTC midnight for the day interval). */
  bucket: z.iso.datetime(),
  feedItems: count,
  tickets: count,
  deliveries: count,
});

export const TimeseriesResponseSchema = z.object({
  buckets: z.array(TimeseriesBucketSchema),
});
export type TimeseriesResponse = z.infer<typeof TimeseriesResponseSchema>;
