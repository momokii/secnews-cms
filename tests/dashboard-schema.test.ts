import { describe, expect, it } from "vitest";
import {
  DateRangeQuerySchema,
  SummaryResponseSchema,
  TimeseriesQuerySchema,
  TimeseriesResponseSchema,
} from "../src/modules/dashboard/schema.js";

describe("DateRangeQuerySchema", () => {
  it("accepts date-only bounds when from and to are present", () => {
    // Given: an inclusive date-only range
    // When: the query is parsed
    const result = DateRangeQuerySchema.safeParse({ from: "2026-01-01", to: "2026-01-31" });

    // Then: the bounds round-trip unchanged
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    }
  });

  it("accepts datetime bounds and an empty query", () => {
    // Given: full timestamps on both bounds and, separately, no bounds at all
    // When: both queries are parsed
    const datetime = DateRangeQuerySchema.safeParse({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T23:59:59.999Z",
    });
    const empty = DateRangeQuerySchema.safeParse({});

    // Then: both parse, bounds kept optional
    expect(datetime.success).toBe(true);
    expect(empty.success).toBe(true);
    if (empty.success) {
      expect(empty.data).toEqual({});
    }
  });

  it("rejects a range whose from is after to", () => {
    // Given: an inverted range
    // When: the query is parsed
    const result = DateRangeQuerySchema.safeParse({ from: "2026-03-01", to: "2026-02-01" });

    // Then: the refinement fails on the from path
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["from"]);
    }
  });

  it("rejects a bound that is neither an ISO date nor datetime", () => {
    // Given: a malformed from bound
    // When: the query is parsed
    const result = DateRangeQuerySchema.safeParse({ from: "not-a-date" });

    // Then: parsing fails
    expect(result.success).toBe(false);
  });
});

describe("TimeseriesQuerySchema", () => {
  it("defaults interval to day when omitted", () => {
    // Given: a query with only bounds
    // When: the query is parsed
    const result = TimeseriesQuerySchema.safeParse({ from: "2026-01-01", to: "2026-01-07" });

    // Then: interval defaults to day
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interval).toBe("day");
    }
  });

  it("accepts an explicit day interval", () => {
    // Given: the only supported interval spelled out
    // When: the query is parsed
    const result = TimeseriesQuerySchema.safeParse({ interval: "day" });

    // Then: parsing succeeds
    expect(result.success).toBe(true);
  });

  it("rejects an unsupported interval", () => {
    // Given: an interval outside the day enum
    // When: the query is parsed
    const result = TimeseriesQuerySchema.safeParse({ interval: "week" });

    // Then: parsing fails
    expect(result.success).toBe(false);
  });

  it("still rejects an inverted range", () => {
    // Given: an extended query with from after to
    // When: the query is parsed
    const result = TimeseriesQuerySchema.safeParse({
      from: "2026-03-01",
      to: "2026-02-01",
      interval: "day",
    });

    // Then: the range refinement fails
    expect(result.success).toBe(false);
  });
});

describe("SummaryResponseSchema", () => {
  const valid = {
    feedItems: { total: 12, byStatus: { UNREVIEWED: 4, VIEWED: 3, TAKEN: 5 } },
    tickets: { total: 7, byStatus: { OPEN: 2, RESEARCH: 1, READY: 1, SENT: 2, CLOSED: 1 } },
    deliveries: { sent: 9, failed: 1 },
  };

  it("accepts a complete summary payload", () => {
    // Given: all three sections populated
    // When: the payload is parsed
    const result = SummaryResponseSchema.safeParse(valid);

    // Then: it round-trips unchanged
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(valid);
    }
  });

  it("accepts partial byStatus maps from sparse group-bys", () => {
    // Given: group-by output that omits statuses with zero rows
    // When: the payload is parsed
    const result = SummaryResponseSchema.safeParse({
      feedItems: { total: 2, byStatus: { TAKEN: 2 } },
      tickets: { total: 0, byStatus: {} },
      deliveries: { sent: 0, failed: 0 },
    });

    // Then: sparse maps are valid
    expect(result.success).toBe(true);
  });

  it("rejects a negative count", () => {
    // Given: an impossible total
    // When: the payload is parsed
    const result = SummaryResponseSchema.safeParse({
      ...valid,
      feedItems: { total: -1, byStatus: {} },
    });

    // Then: parsing fails
    expect(result.success).toBe(false);
  });

  it("rejects an unknown status key", () => {
    // Given: a status that is not part of the domain enum
    // When: the payload is parsed
    const result = SummaryResponseSchema.safeParse({
      ...valid,
      feedItems: { total: 1, byStatus: { ARCHIVED: 1 } },
    });

    // Then: parsing fails
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric delivery count", () => {
    // Given: sent reported as a string
    // When: the payload is parsed
    const result = SummaryResponseSchema.safeParse({
      ...valid,
      deliveries: { sent: "9", failed: 1 },
    });

    // Then: parsing fails
    expect(result.success).toBe(false);
  });
});

describe("TimeseriesResponseSchema", () => {
  it("accepts a bucket series with the required per-bucket counts", () => {
    // Given: two day buckets covering both metrics
    // When: the payload is parsed
    const result = TimeseriesResponseSchema.safeParse({
      buckets: [
        { bucket: "2026-01-01T00:00:00.000Z", feedItems: 3, tickets: 1, deliveries: 0 },
        { bucket: "2026-01-02T00:00:00.000Z", feedItems: 5, tickets: 2, deliveries: 1 },
      ],
    });

    // Then: it round-trips unchanged
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buckets).toHaveLength(2);
    }
  });

  it("accepts an empty series", () => {
    // Given: a range with no data
    // When: the payload is parsed
    const result = TimeseriesResponseSchema.safeParse({ buckets: [] });

    // Then: the empty array is valid
    expect(result.success).toBe(true);
  });

  it("rejects a bucket missing a metric", () => {
    // Given: a bucket without the deliveries count
    // When: the payload is parsed
    const result = TimeseriesResponseSchema.safeParse({
      buckets: [{ bucket: "2026-01-01T00:00:00.000Z", feedItems: 3, tickets: 1 }],
    });

    // Then: parsing fails
    expect(result.success).toBe(false);
  });

  it("rejects a bucket whose timestamp is not an ISO datetime", () => {
    // Given: a bucket keyed by a free-form string
    // When: the payload is parsed
    const result = TimeseriesResponseSchema.safeParse({
      buckets: [{ bucket: "early january", feedItems: 3, tickets: 1, deliveries: 0 }],
    });

    // Then: parsing fails
    expect(result.success).toBe(false);
  });
});
