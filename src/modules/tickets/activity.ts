import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  TicketActivityAction as PrismaTicketActivityAction,
} from "../../generated/prisma/enums.js";
import { z } from "zod/v4";
import { paginated, pageQuery } from "../../common/pagination.js";
import { prisma } from "../../lib/db.js";
import { UuidIdParamSchema } from "./schema.js";

/**
 * TASK-ACT — ticket audit trail. Every mutation of a ticket appends one
 * immutable TicketActivity row (actor + action + optional detail); the
 * timeline reads them back newest first via GET /tickets/:id/activity.
 */

export type ActivityClient = PrismaClient | Prisma.TransactionClient;

export type ActivityInput = {
  ticketId: string;
  /** Null for system-originated events; resolved to a display name on read. */
  actorId: string | null;
  action: PrismaTicketActivityAction;
  detail?: string | null;
};

/** Append one audit entry. Pass a transaction client to keep the entry
 * atomic with the change it describes. Fire-and-forget safe: never throws
 * to the caller's error path beyond a failed write. */
export function recordActivity(
  client: ActivityClient,
  input: ActivityInput,
): Promise<void> {
  return client.ticketActivity
    .create({
      data: {
        ticketId: input.ticketId,
        actorId: input.actorId,
        action: input.action,
        ...(input.detail === undefined || input.detail === null
          ? {}
          : { detail: input.detail }),
      },
      select: { id: true },
    })
    .then(() => undefined);
}

export const TicketActivitySchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  actorId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  action: z.enum(PrismaTicketActivityAction),
  detail: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type TicketActivity = z.infer<typeof TicketActivitySchema>;

export const ListTicketActivityResponseSchema = paginated(TicketActivitySchema);

/** ?page&pageSize&action — the optional action narrows the timeline to one
 * TicketActivityAction; any other value is rejected as 400 VALIDATION. */
const ActivityListQuerySchema = pageQuery.extend({
  action: z.optional(z.enum(PrismaTicketActivityAction)),
});

type ActivityRow = Prisma.TicketActivityGetPayload<{
  include: { actor: { select: { name: true } } };
}>;

export function toTicketActivityDto(row: ActivityRow): TicketActivity {
  return {
    id: row.id,
    ticketId: row.ticketId,
    actorId: row.actorId,
    actorName: row.actor?.name ?? null,
    action: row.action,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Route 53 — GET /tickets/:id/activity: the ticket's audit timeline,
 * newest first, actor names joined, optionally narrowed by ?action=. */
export async function registerActivityRoute(app: FastifyInstance): Promise<void> {
  const routeApp = app.withTypeProvider<ZodTypeProvider>();

  routeApp.get(
    "/:id/activity",
    {
      schema: {
        params: UuidIdParamSchema,
        querystring: ActivityListQuerySchema,
        response: { 200: ListTicketActivityResponseSchema },
      },
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
    },
    async (request) => {
      const { id } = request.params;
      const { page, pageSize, action } = request.query;
      const where: Prisma.TicketActivityWhereInput = {
        ticketId: id,
        ...(action === undefined ? {} : { action }),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.ticketActivity.findMany({
          where,
          include: { actor: { select: { name: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.ticketActivity.count({ where }),
      ]);
      return { items: rows.map(toTicketActivityDto), total, page, pageSize };
    },
  );
}
