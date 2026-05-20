-- CreateTable
CREATE TABLE "ClauseTable" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "clauseCode" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "headers" TEXT[],
    "rows" JSONB NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClauseTable_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ClauseTable" ADD CONSTRAINT "ClauseTable_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
