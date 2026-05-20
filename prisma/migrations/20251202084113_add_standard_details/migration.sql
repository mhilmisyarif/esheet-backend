-- AlterTable
ALTER TABLE "TestStandard" ADD COLUMN     "standard_number" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
