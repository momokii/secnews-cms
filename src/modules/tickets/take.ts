import type { Ticket } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../lib/db.js";
import { recordActivity } from "./activity.js";

/**
 * Feed-item take (route 19): atomically claims an UNREVIEWED/VIEWED item as
 * TAKEN and spawns its OPEN AUTO_FEED ticket. TAKEN is terminal — a second
 * take is the documented 409 CONFLICT (TAKE-02).
 */

// Given: the ingest raw payload is untyped JSON — only a top-level string
// `summary` is trustworthy as the working summary.
function deriveSummary(raw: unknown, fallback: string): string {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw) && "summary" in raw) {
    const summary = raw["summary"];
    if (typeof summary === "string" && summary.trim() !== "") {
      return summary;
    }
  }
  return fallback;
}

export async function takeFeedItem(
  feedItemId: string,
  actorId: string | null,
): Promise<Ticket> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.feedItem.findUnique({ where: { id: feedItemId } });
    if (item === null) {
      throw new AppError("NOT_FOUND", `Feed item ${feedItemId} not found`);
    }

    const claimed = await tx.feedItem.updateMany({
      where: { id: item.id, status: { not: "TAKEN" } },
      data: { status: "TAKEN" },
    });
    if (claimed.count === 0) {
      throw new AppError("CONFLICT", "Feed item has already been taken");
    }

    const ticket = await tx.ticket.create({
      data: {
        title: item.title,
        summary: deriveSummary(item.raw, item.title),
        origin: "AUTO_FEED",
        status: "OPEN",
        findingType: "OTHER",
        feedItemId: item.id,
        takenById: actorId,
      },
      include: { takenBy: { select: { name: true } } },
    });
    await recordActivity(tx, {
      ticketId: ticket.id,
      actorId,
      action: "TAKEN",
      detail: "taken from feed",
    });
    return ticket;
  });
}
