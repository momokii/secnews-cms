/*
  Warnings:

  - Added the required column `payload` to the `DeliveryAudit` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DeliveryAudit" ADD COLUMN     "payload" TEXT NOT NULL,
ADD COLUMN     "sentById" TEXT;
