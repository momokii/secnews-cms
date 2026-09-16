import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import {
  SummaryResponseSchema,
  TimeseriesResponseSchema,
} from "../src/modules/dashboard/schema.js";
import { prisma } from "../src/lib/db.js";
import { bearer, c3Cleanup, c3User, type C3User } from "./tickets.fixtures.js";

/** GET /dashboard/summary + /dashboard/timeseries HTTP contract: role gate
 * (real DB-backed requireRole), 400 VALIDATION on bad from/to/interval, and
 * responses matching the module schemas. Queries target a far-future empty
 * window no other suite touches, so zero counts are stable under parallel
 * test runs; query math itself is covered by dashboard-summary/timeseries. */

describe("GET /dashboard/summary", () => {
  let app: FastifyInstance;
  let analyst: C3User;

  beforeAll(async () => {
    app = await buildApp();
    analyst = await c3User("ANALYST");
  });

  afterAll(async () => {
    await c3Cleanup({ emails: [analyst.email] });
    await app.close();
    await prisma.$disconnect();
  });

  it("answers 200 with a zeroed schema-shaped summary for an authenticated member", async () => {
    // Given: an ANALYST session (lowest role) and an empty query window
    // When: the summary is fetched for a far-future day with no rows
    const response = await app.inject({
      method: "GET",
      url: "/dashboard/summary?from=2030-01-01&to=2030-01-01",
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: the query layer ran and the body matches SummaryResponseSchema
    expect(response.statusCode).toBe(200);
    const body = response.json() as unknown;
    expect(body).toEqual({
      feedItems: { total: 0, byStatus: {} },
      tickets: { total: 0, byStatus: {} },
      deliveries: { sent: 0, failed: 0 },
    });
    expect(SummaryResponseSchema.safeParse(body).success).toBe(true);
  });

  it("rejects a malformed from with 400 VALIDATION", async () => {
    // Given: an authenticated request
    // When: from is not an ISO date or datetime
    const response = await app.inject({
      method: "GET",
      url: "/dashboard/summary?from=not-a-date",
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: the boundary reports validation failure
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
  });

  it("rejects a range whose from is after to with 400 VALIDATION", async () => {
    // Given: an authenticated request
    // When: the lower bound is later than the upper bound
    const response = await app.inject({
      method: "GET",
      url: "/dashboard/summary?from=2030-01-02&to=2030-01-01",
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: the boundary reports validation failure
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
  });

  it("requires an authenticated session", async () => {
    // Given: no Authorization header
    // When: the summary is fetched anonymously
    const response = await app.inject({ method: "GET", url: "/dashboard/summary" });

    // Then: the role gate answers 401 UNAUTHORIZED
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /dashboard/timeseries", () => {
  let app: FastifyInstance;
  let analyst: C3User;

  beforeAll(async () => {
    app = await buildApp();
    analyst = await c3User("ANALYST");
  });

  afterAll(async () => {
    await c3Cleanup({ emails: [analyst.email] });
    await app.close();
    await prisma.$disconnect();
  });

  it("zero-fills one bucket per day and matches the response contract", async () => {
    // Given: an ANALYST session and an empty query window
    // When: the timeseries is fetched with the explicit day interval
    const response = await app.inject({
      method: "GET",
      url: "/dashboard/timeseries?from=2030-01-01&to=2030-01-03&interval=day",
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: each Jakarta day yields a zeroed bucket at its UTC-midnight
    // instant; the date-only to=2030-01-03 widens to end-of-UTC-day, which is
    // Jakarta day 2030-01-04, so four buckets come back
    expect(response.statusCode).toBe(200);
    const body = response.json() as unknown;
    expect(body).toEqual({
      buckets: [
        {
          bucket: "2029-12-31T17:00:00.000Z",
          feedItems: 0,
          tickets: 0,
          deliveries: 0,
        },
        {
          bucket: "2030-01-01T17:00:00.000Z",
          feedItems: 0,
          tickets: 0,
          deliveries: 0,
        },
        {
          bucket: "2030-01-02T17:00:00.000Z",
          feedItems: 0,
          tickets: 0,
          deliveries: 0,
        },
        {
          bucket: "2030-01-03T17:00:00.000Z",
          feedItems: 0,
          tickets: 0,
          deliveries: 0,
        },
      ],
    });
    expect(TimeseriesResponseSchema.safeParse(body).success).toBe(true);
  });

  it("defaults the interval to day when the query omits it", async () => {
    // Given: a bounded one-day window without an interval param
    // When: the timeseries is fetched
    const response = await app.inject({
      method: "GET",
      url: "/dashboard/timeseries?from=2030-01-01&to=2030-01-01",
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: two zeroed buckets come back (2030-01-01 plus the end-of-UTC-day
    // spill into Jakarta day 2030-01-02)
    expect(response.statusCode).toBe(200);
    const body = response.json() as { buckets: Array<{ bucket: string; feedItems: number; tickets: number; deliveries: number }> };
    expect(body.buckets.map((b) => b.bucket)).toEqual([
      "2029-12-31T17:00:00.000Z",
      "2030-01-01T17:00:00.000Z",
    ]);
  });

  it("rejects an unknown interval with 400 VALIDATION", async () => {
    // Given: an authenticated request
    // When: interval is not in the supported enum
    const response = await app.inject({
      method: "GET",
      url: "/dashboard/timeseries?interval=week",
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: the boundary reports validation failure
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
  });

  it("rejects a range whose from is after to with 400 VALIDATION", async () => {
    // Given: an authenticated request
    // When: the lower bound is later than the upper bound
    const response = await app.inject({
      method: "GET",
      url: "/dashboard/timeseries?from=2030-01-02&to=2030-01-01",
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: the boundary reports validation failure
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
  });

  it("requires an authenticated session", async () => {
    // Given: no Authorization header
    // When: the timeseries is fetched anonymously
    const response = await app.inject({ method: "GET", url: "/dashboard/timeseries" });

    // Then: the role gate answers 401 UNAUTHORIZED
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });
});
