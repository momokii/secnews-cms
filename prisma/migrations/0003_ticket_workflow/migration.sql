-- TASK-C3: ticket workflow core — source/IOC provenance and DB↔wire alignment.
-- TicketSource: url became optional (note-only sources), label renamed to the
-- contract name `note`, and createdById records who added it. Ioc gains
-- context/origin provenance plus createdById. Ticket children now cascade on
-- ticket deletion (the ticket owns its working materials).

-- TicketSource
ALTER TABLE "TicketSource" ALTER COLUMN "url" DROP NOT NULL;
ALTER TABLE "TicketSource" RENAME COLUMN "label" TO "note";
ALTER TABLE "TicketSource" ADD COLUMN "createdById" TEXT;
ALTER TABLE "TicketSource" ADD CONSTRAINT "TicketSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketSource" DROP CONSTRAINT "TicketSource_ticketId_fkey";
ALTER TABLE "TicketSource" ADD CONSTRAINT "TicketSource_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ioc
ALTER TABLE "Ioc" ADD COLUMN "context" TEXT;
ALTER TABLE "Ioc" ADD COLUMN "origin" TEXT;
ALTER TABLE "Ioc" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Ioc" ADD CONSTRAINT "Ioc_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ioc" DROP CONSTRAINT "Ioc_ticketId_fkey";
ALTER TABLE "Ioc" ADD CONSTRAINT "Ioc_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
