-- CreateTable
CREATE TABLE "TableTemplate" (
    "id" SERIAL NOT NULL,
    "testStandardId" INTEGER NOT NULL,
    "subClauseCode" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "definition" JSONB NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableInstance" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "templateId" INTEGER NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableTemplate_testStandardId_subClauseCode_idx" ON "TableTemplate"("testStandardId", "subClauseCode");

-- CreateIndex
CREATE INDEX "TableInstance_reportId_templateId_idx" ON "TableInstance"("reportId", "templateId");

-- AddForeignKey
ALTER TABLE "TableTemplate" ADD CONSTRAINT "TableTemplate_testStandardId_fkey" FOREIGN KEY ("testStandardId") REFERENCES "TestStandard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableTemplate" ADD CONSTRAINT "TableTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableInstance" ADD CONSTRAINT "TableInstance_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableInstance" ADD CONSTRAINT "TableInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TableTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
