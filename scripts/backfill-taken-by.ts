import "dotenv/config";
import { prisma } from "../src/lib/db.js";
import { TicketActivityAction } from "../src/generated/prisma/enums.js";

/**
 * TASK-PUSHFIX one-shot backfill: ownerless tickets (takenById null) get
 * their historical owner from the actor of their most recent TAKEN/CREATED
 * TicketActivity — the same fallback the list/detail routes apply at read
 * time. Dev run: npx tsx scripts/backfill-taken-by.ts (DATABASE_URL must
 * point at the target DB). Prod backfill runs separately post-deploy.
 */

const dbUrl = process.env["DATABASE_URL"] ?? "";
if (process.env["APP_ENV"] !== "development" && process.env["APP_ENV"] !== "test") {
  throw new Error(`refusing to backfill outside dev/test (APP_ENV=${String(process.env["APP_ENV"])})`);
}
if (!dbUrl.includes(":5433")) {
  throw new Error("refusing to backfill a non-dev database (DATABASE_URL host must be :5433)");
}

const owners = new Map<string, string>();
const activities = await prisma.ticketActivity.findMany({
  where: {
    action: { in: [TicketActivityAction.TAKEN, TicketActivityAction.CREATED] },
    actorId: { not: null },
  },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  select: { ticketId: true, actorId: true },
});
for (const activity of activities) {
  if (activity.actorId !== null && !owners.has(activity.ticketId)) {
    owners.set(activity.ticketId, activity.actorId);
  }
}

const ownerlessIds = (
  await prisma.ticket.findMany({ where: { takenById: null }, select: { id: true } })
).map((row) => row.id);

let filled = 0;
for (const ticketId of ownerlessIds) {
  const actorId = owners.get(ticketId);
  if (actorId === undefined) {
    continue;
  }
  await prisma.ticket.update({ where: { id: ticketId }, data: { takenById: actorId } });
  filled++;
}

console.log(
  `backfill-taken-by: ${ownerlessIds.length} ownerless ticket(s) found, ${filled} filled from activity history`,
);
await prisma.$disconnect();
