-- CreateTable
CREATE TABLE "Component" (
    "id" SERIAL NOT NULL,
    "sampleId" INTEGER NOT NULL,
    "objek" TEXT NOT NULL,
    "pabrikan" TEXT,
    "tipe" TEXT,
    "data_teknis" TEXT,
    "standar" TEXT,
    "tanda" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ReportImage" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'SAMPLE';
