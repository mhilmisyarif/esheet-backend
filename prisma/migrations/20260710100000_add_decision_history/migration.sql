-- Append-only audit trail for keputusan / hasil_catatan changes
CREATE TABLE "DecisionHistory" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "klausulCode" TEXT NOT NULL,
    "subKode" TEXT NOT NULL,
    "butirKode" TEXT,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "actorId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DecisionHistory_reportId_idx" ON "DecisionHistory"("reportId");
CREATE INDEX "DecisionHistory_reportId_klausulCode_idx" ON "DecisionHistory"("reportId", "klausulCode");

ALTER TABLE "DecisionHistory" ADD CONSTRAINT "DecisionHistory_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionHistory" ADD CONSTRAINT "DecisionHistory_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
