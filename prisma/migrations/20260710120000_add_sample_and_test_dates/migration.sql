-- Tanggal masuk sampel (registration form) + tanggal pengujian
-- (auto-computed: start = first saved change, finish = last klausul submitted)
ALTER TABLE "Sample" ADD COLUMN "received_date" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "test_started_at" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "test_finished_at" TIMESTAMP(3);
