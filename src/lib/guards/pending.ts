import type { PrismaClient } from "../../generated/prisma/client.js";
import { SuggestionStatus } from "../../generated/prisma/enums.js";
import { AppError } from "../../common/errors.js";

/**
 * HARD BLOCK guard (scenario S2). Send (#47), OTX push (#52) and the
 * → SENT transition (#25) MUST consult this before proceeding: any
 * AiSuggestion still PENDING on the ticket raises 409 PENDING_SUGGESTIONS
 * with the blocking count in details.
 */
export async function assertNoPendingSuggestions(db: PrismaClient, ticketId: string): Promise<void> {
  const pending = await db.aiSuggestion.count({
    where: { ticketId, status: SuggestionStatus.PENDING },
  });
  if (pending > 0) {
    throw new AppError(
      "PENDING_SUGGESTIONS",
      `Ticket has ${pending} unresolved AI suggestion(s) — accept or reject them first`,
      { pending },
    );
  }
}
