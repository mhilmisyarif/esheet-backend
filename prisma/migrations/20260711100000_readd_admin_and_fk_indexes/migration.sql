-- 1) Re-add ADMIN to UserRole.
--    Migration 20260505143106 rebuilt the enum as (TECHNICIAN, ENGINEER,
--    DRAFTER) — dropping ADMIN — but schema.prisma and every authorize('ADMIN')
--    route still reference it, so the value must exist in the DB.
--    (PostgreSQL 12+: ADD VALUE may run inside a transaction as long as the
--     new value is not used in the same transaction — which it isn't here.)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';

-- 2) FK indexes declared in schema.prisma but never migrated (the original
--    re-add migration was lost). Postgres does not index FK columns
--    automatically; these are hot-path joins for report/order detail pages.
CREATE INDEX IF NOT EXISTS "Sample_orderId_idx" ON "Sample"("orderId");
CREATE INDEX IF NOT EXISTS "ReportImage_reportId_idx" ON "ReportImage"("reportId");
CREATE INDEX IF NOT EXISTS "ReportHistory_reportId_idx" ON "ReportHistory"("reportId");
