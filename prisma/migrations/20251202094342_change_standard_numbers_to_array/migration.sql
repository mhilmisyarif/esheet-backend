/*
  Warnings:

  - You are about to drop the column `standard_number` on the `TestStandard` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TestStandard" DROP COLUMN "standard_number",
ADD COLUMN     "standard_numbers" TEXT[];
