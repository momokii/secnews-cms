import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { TicketActivityAction } from "../../generated/prisma/enums.js";

export type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Legacy ticket rows can carry no takenById even though the audit trail
 * recorded who took/created them. Resolve the actor of the most recent
 * TAKEN/CREATED activity per ticket — first hit per ticket wins (rows come
 * newest first). Callers only use this when the takenBy relation is empty;
 * the relation always wins over activity history.
 */
export async function recentActivityTakenBy(
  db: DbClient,
  ticketIds: string[],
): Promise<Map<string, string>> {
  if (ticketIds.length === 0) {
    return new Map();
  }
  const rows = await db.ticketActivity.findMany({
    where: {
      ticketId: { in: ticketIds },
      action: { in: [TicketActivityAction.TAKEN, TicketActivityAction.CREATED] },
      actorId: { not: null },
    },
    include: { actor: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const names = new Map<string, string>();
  for (const row of rows) {
    if (row.actor !== null && !names.has(row.ticketId)) {
      names.set(row.ticketId, row.actor.name);
    }
  }
  return names;
}
