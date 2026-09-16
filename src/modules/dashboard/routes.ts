import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  DateRangeQuerySchema,
  SummaryResponseSchema,
  TimeseriesQuerySchema,
  TimeseriesResponseSchema,
} from "./schema.js";
import { dashboardSummary } from "./summary.js";
import { dashboardTimeseries } from "./timeseries.js";

/** GET /dashboard/summary + /dashboard/timeseries — read-only analytics over
 * aggregate counts, open to every member role like the other read surfaces.
 * The zod schemas own the from/to/interval contract (including from <= to);
 * the handlers are pure delegation to the query layer. */
export default async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();
  const read = app.requireRole("ADMIN", "EDITOR", "ANALYST");

  // GET /dashboard/summary?from&to
  f.get("/summary", {
    onRequest: [read],
    schema: {
      querystring: DateRangeQuerySchema,
      response: { 200: SummaryResponseSchema },
    },
  }, async (request) => dashboardSummary(request.query));

  // GET /dashboard/timeseries?from&to&interval
  f.get("/timeseries", {
    onRequest: [read],
    schema: {
      querystring: TimeseriesQuerySchema,
      response: { 200: TimeseriesResponseSchema },
    },
  }, async (request) => dashboardTimeseries(request.query));
}
