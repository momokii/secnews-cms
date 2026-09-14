-- CreateEnum
CREATE TYPE "TicketActivityAction" AS ENUM ('CREATED', 'TAKEN', 'STATUS_CHANGED', 'FIELDS_UPDATED', 'IOC_ADDED', 'IOC_UPDATED', 'IOC_REMOVED', 'SOURCE_ADDED', 'SOURCE_REMOVED', 'AI_FILL', 'AI_ENRICH', 'SUGGESTION_ACCEPTED', 'SUGGESTION_REJECTED', 'SENT', 'OTX_PUSHED');

-- CreateTable
CREATE TABLE "TicketActivity" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "TicketActivityAction" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketActivity_ticketId_createdAt_idx" ON "TicketActivity"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
