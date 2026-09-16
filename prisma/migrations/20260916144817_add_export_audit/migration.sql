-- CreateEnum
CREATE TYPE "ExportType" AS ENUM ('FEED', 'TICKET');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'JSON', 'XLSX');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "ExportAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "ExportType" NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "from" TIMESTAMP(3),
    "to" TIMESTAMP(3),
    "status" "ExportStatus" NOT NULL,
    "rowCount" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExportAudit_createdAt_idx" ON "ExportAudit"("createdAt");

-- CreateIndex
CREATE INDEX "ExportAudit_actorId_idx" ON "ExportAudit"("actorId");

-- AddForeignKey
ALTER TABLE "ExportAudit" ADD CONSTRAINT "ExportAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
