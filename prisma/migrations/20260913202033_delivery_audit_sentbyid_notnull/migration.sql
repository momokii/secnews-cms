/*
  Warnings:

  - Made the column `sentById` on table `DeliveryAudit` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "DeliveryAudit" ALTER COLUMN "sentById" SET NOT NULL;
