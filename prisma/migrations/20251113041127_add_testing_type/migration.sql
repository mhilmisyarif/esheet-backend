-- CreateEnum
CREATE TYPE "TestingType" AS ENUM ('FULL', 'VERIFICATION');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "testing_type" "TestingType" NOT NULL DEFAULT 'FULL';
