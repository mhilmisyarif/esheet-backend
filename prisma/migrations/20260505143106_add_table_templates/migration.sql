/*
  Warnings:

  - The values [SUBMITTED,REJECTED,REVISED] on the enum `ReportStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [ADMIN] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `rejection_reason` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `submitted_at` on the `Report` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "KlausulStatusEnum" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- AlterEnum
BEGIN;
CREATE TYPE "ReportStatus_new" AS ENUM ('DRAFT', 'IN_PROGRESS', 'APPROVED');
ALTER TABLE "public"."Report" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Report" ALTER COLUMN "status" TYPE "ReportStatus_new" USING ("status"::text::"ReportStatus_new");
ALTER TYPE "ReportStatus" RENAME TO "ReportStatus_old";
ALTER TYPE "ReportStatus_new" RENAME TO "ReportStatus";
DROP TYPE "public"."ReportStatus_old";
ALTER TABLE "Report" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('TECHNICIAN', 'ENGINEER', 'DRAFTER');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'TECHNICIAN';
COMMIT;

-- AlterTable
ALTER TABLE "Report" DROP COLUMN "rejection_reason",
DROP COLUMN "submitted_at",
ADD COLUMN     "doc_address" TEXT,
ADD COLUMN     "doc_applicant" TEXT,
ADD COLUMN     "doc_location" TEXT DEFAULT 'Laboratorium PT. SUCOFINDO',
ADD COLUMN     "doc_notes" TEXT,
ADD COLUMN     "doc_standard" TEXT;

-- CreateTable
CREATE TABLE "KlausulStatus" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "klausulCode" TEXT NOT NULL,
    "status" "KlausulStatusEnum" NOT NULL DEFAULT 'DRAFT',
    "submittedById" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "corrections" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KlausulStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KlausulStatus_reportId_idx" ON "KlausulStatus"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "KlausulStatus_reportId_klausulCode_key" ON "KlausulStatus"("reportId", "klausulCode");

-- AddForeignKey
ALTER TABLE "KlausulStatus" ADD CONSTRAINT "KlausulStatus_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KlausulStatus" ADD CONSTRAINT "KlausulStatus_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KlausulStatus" ADD CONSTRAINT "KlausulStatus_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
