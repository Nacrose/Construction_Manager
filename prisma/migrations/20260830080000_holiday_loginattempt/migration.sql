-- ═══════════════════════════════════════════════════════════════════════════
-- Platform tables: admin-editable Holiday calendar + LoginAttempt log
-- ═══════════════════════════════════════════════════════════════════════════
-- Holiday: authoritative per-year holiday source for the Nepal working-day
-- calendar (nepal-calendar.ts). Seeded from the compiled constant + an
-- approximate 2027 set (lunar drift — correct via admin router as needed).
-- Neither table is tenant-scoped (no organizationId/projectId → outside the
-- RLS inventory, like User/Session).
--
-- LoginAttempt: durable rate-limit backing store — the in-memory limiter
-- could not survive a serverless cold start or share state across instances.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateTable: Holiday
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'public',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LoginAttempt
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- Seed holidays (idempotent: deterministic id per date, ON CONFLICT skip).
-- holiday_id() derives a stable id from the date so re-runs never duplicate.
CREATE OR REPLACE FUNCTION holiday_id(d text) RETURNS text AS $$
    SELECT 'holiday-' || d
$$ LANGUAGE sql IMMUTABLE;

INSERT INTO "Holiday" ("id", "date", "name", "type") VALUES
    (holiday_id('2025-01-11'), '2025-01-11', 'Prithvi Jayanti', 'public'),
    (holiday_id('2025-02-19'), '2025-02-19', 'Democracy Day', 'public'),
    (holiday_id('2025-02-26'), '2025-02-26', 'Maha Shivaratri', 'festival'),
    (holiday_id('2025-03-08'), '2025-03-08', 'International Women''s Day', 'public'),
    (holiday_id('2025-03-14'), '2025-03-14', 'Holi (Terai)', 'festival'),
    (holiday_id('2025-03-13'), '2025-03-13', 'Holi (Hills)', 'festival'),
    (holiday_id('2025-04-13'), '2025-04-13', 'Nepali New Year (Baisakh 1)', 'public'),
    (holiday_id('2025-04-14'), '2025-04-14', 'Baisakh 2', 'public'),
    (holiday_id('2025-05-01'), '2025-05-01', 'Labour Day', 'public'),
    (holiday_id('2025-05-26'), '2025-05-26', 'Buddha Jayanti', 'festival'),
    (holiday_id('2025-09-22'), '2025-09-22', 'Dashain Day 1 (Ghatasthapana)', 'festival'),
    (holiday_id('2025-09-23'), '2025-09-23', 'Dashain Day 2', 'festival'),
    (holiday_id('2025-09-24'), '2025-09-24', 'Dashain Day 3', 'festival'),
    (holiday_id('2025-09-25'), '2025-09-25', 'Dashain Day 4', 'festival'),
    (holiday_id('2025-09-26'), '2025-09-26', 'Dashain Day 5', 'festival'),
    (holiday_id('2025-09-27'), '2025-09-27', 'Dashain Day 6 (Phulpati)', 'festival'),
    (holiday_id('2025-09-28'), '2025-09-28', 'Dashain Day 7 (Maha Ashtami)', 'festival'),
    (holiday_id('2025-09-29'), '2025-09-29', 'Dashain Day 8 (Maha Nawami)', 'festival'),
    (holiday_id('2025-09-30'), '2025-09-30', 'Dashain Day 9 (Vijaya Dashami)', 'festival'),
    (holiday_id('2025-10-01'), '2025-10-01', 'Dashain Day 10 (Ekadashi)', 'festival'),
    (holiday_id('2025-10-02'), '2025-10-02', 'Dashain Day 11', 'festival'),
    (holiday_id('2025-10-03'), '2025-10-03', 'Dashain Day 12', 'festival'),
    (holiday_id('2025-10-04'), '2025-10-04', 'Dashain Day 13', 'festival'),
    (holiday_id('2025-10-05'), '2025-10-05', 'Dashain Day 14 (Kojagrat Purnima)', 'festival'),
    (holiday_id('2025-10-19'), '2025-10-19', 'Tihar Day 1 (Kaag Tihar)', 'festival'),
    (holiday_id('2025-10-20'), '2025-10-20', 'Tihar Day 2 (Kukur Tihar)', 'festival'),
    (holiday_id('2025-10-21'), '2025-10-21', 'Tihar Day 3 (Laxmi Puja / Deepawali)', 'festival'),
    (holiday_id('2025-10-22'), '2025-10-22', 'Tihar Day 4 (Govardhan Puja / Mha Puja)', 'festival'),
    (holiday_id('2025-10-23'), '2025-10-23', 'Tihar Day 5 (Bhai Tika)', 'festival'),
    (holiday_id('2025-11-20'), '2025-11-20', 'Chhath Parva', 'festival'),
    (holiday_id('2025-12-29'), '2025-12-29', 'Constitution Day', 'public'),
    (holiday_id('2026-01-11'), '2026-01-11', 'Prithvi Jayanti', 'public'),
    (holiday_id('2026-02-19'), '2026-02-19', 'Democracy Day', 'public'),
    (holiday_id('2026-02-15'), '2026-02-15', 'Maha Shivaratri', 'festival'),
    (holiday_id('2026-03-03'), '2026-03-03', 'Holi (Hills)', 'festival'),
    (holiday_id('2026-03-04'), '2026-03-04', 'Holi (Terai)', 'festival'),
    (holiday_id('2026-04-13'), '2026-04-13', 'Nepali New Year (Baisakh 1)', 'public'),
    (holiday_id('2026-04-14'), '2026-04-14', 'Baisakh 2', 'public'),
    (holiday_id('2026-05-01'), '2026-05-01', 'Labour Day', 'public'),
    (holiday_id('2026-05-15'), '2026-05-15', 'Buddha Jayanti', 'festival'),
    (holiday_id('2026-10-11'), '2026-10-11', 'Dashain Day 1 (Ghatasthapana)', 'festival'),
    (holiday_id('2026-10-12'), '2026-10-12', 'Dashain Day 2', 'festival'),
    (holiday_id('2026-10-13'), '2026-10-13', 'Dashain Day 3', 'festival'),
    (holiday_id('2026-10-14'), '2026-10-14', 'Dashain Day 4', 'festival'),
    (holiday_id('2026-10-15'), '2026-10-15', 'Dashain Day 5', 'festival'),
    (holiday_id('2026-10-16'), '2026-10-16', 'Dashain Day 6 (Phulpati)', 'festival'),
    (holiday_id('2026-10-17'), '2026-10-17', 'Dashain Day 7 (Maha Ashtami)', 'festival'),
    (holiday_id('2026-10-18'), '2026-10-18', 'Dashain Day 8 (Maha Nawami)', 'festival'),
    (holiday_id('2026-10-19'), '2026-10-19', 'Dashain Day 9 (Vijaya Dashami)', 'festival'),
    (holiday_id('2026-10-20'), '2026-10-20', 'Dashain Day 10', 'festival'),
    (holiday_id('2026-11-08'), '2026-11-08', 'Tihar Day 1 (Kaag Tihar)', 'festival'),
    (holiday_id('2026-11-09'), '2026-11-09', 'Tihar Day 2 (Kukur Tihar)', 'festival'),
    (holiday_id('2026-11-10'), '2026-11-10', 'Tihar Day 3 (Laxmi Puja)', 'festival'),
    (holiday_id('2026-11-11'), '2026-11-11', 'Tihar Day 4 (Govardhan/Mha Puja)', 'festival'),
    (holiday_id('2026-11-12'), '2026-11-12', 'Tihar Day 5 (Bhai Tika)', 'festival'),
    (holiday_id('2027-01-11'), '2027-01-11', 'Prithvi Jayanti', 'public'),
    (holiday_id('2027-02-19'), '2027-02-19', 'Democracy Day', 'public'),
    (holiday_id('2027-03-09'), '2027-03-09', 'Maha Shivaratri', 'festival'),
    (holiday_id('2027-03-22'), '2027-03-22', 'Holi (Hills)', 'festival'),
    (holiday_id('2027-03-23'), '2027-03-23', 'Holi (Terai)', 'festival'),
    (holiday_id('2027-03-08'), '2027-03-08', 'International Women''s Day', 'public'),
    (holiday_id('2027-04-14'), '2027-04-14', 'Nepali New Year (Baisakh 1)', 'public'),
    (holiday_id('2027-04-15'), '2027-04-15', 'Baisakh 2', 'public'),
    (holiday_id('2027-05-01'), '2027-05-01', 'Labour Day', 'public'),
    (holiday_id('2027-05-21'), '2027-05-21', 'Buddha Jayanti', 'festival'),
    (holiday_id('2027-09-30'), '2027-09-30', 'Dashain Day 1 (Ghatasthapana)', 'festival'),
    (holiday_id('2027-10-01'), '2027-10-01', 'Dashain Day 2', 'festival'),
    (holiday_id('2027-10-02'), '2027-10-02', 'Dashain Day 3', 'festival'),
    (holiday_id('2027-10-03'), '2027-10-03', 'Dashain Day 4', 'festival'),
    (holiday_id('2027-10-04'), '2027-10-04', 'Dashain Day 5', 'festival'),
    (holiday_id('2027-10-05'), '2027-10-05', 'Dashain Day 6', 'festival'),
    (holiday_id('2027-10-06'), '2027-10-06', 'Dashain Day 7 (Phulpati)', 'festival'),
    (holiday_id('2027-10-07'), '2027-10-07', 'Dashain Day 8 (Maha Ashtami)', 'festival'),
    (holiday_id('2027-10-08'), '2027-10-08', 'Dashain Day 9 (Maha Nawami)', 'festival'),
    (holiday_id('2027-10-09'), '2027-10-09', 'Dashain Day 10 (Vijaya Dashami)', 'festival'),
    (holiday_id('2027-10-10'), '2027-10-10', 'Dashain Day 11', 'festival'),
    (holiday_id('2027-10-11'), '2027-10-11', 'Dashain Day 12', 'festival'),
    (holiday_id('2027-10-12'), '2027-10-12', 'Dashain Day 13', 'festival'),
    (holiday_id('2027-10-13'), '2027-10-13', 'Dashain Day 14 (Kojagrat Purnima)', 'festival'),
    (holiday_id('2027-10-27'), '2027-10-27', 'Tihar Day 1 (Kaag Tihar)', 'festival'),
    (holiday_id('2027-10-28'), '2027-10-28', 'Tihar Day 2 (Kukur Tihar)', 'festival'),
    (holiday_id('2027-10-29'), '2027-10-29', 'Tihar Day 3 (Laxmi Puja / Deepawali)', 'festival'),
    (holiday_id('2027-10-30'), '2027-10-30', 'Tihar Day 4 (Govardhan Puja / Mha Puja)', 'festival'),
    (holiday_id('2027-10-31'), '2027-10-31', 'Tihar Day 5 (Bhai Tika)', 'festival'),
    (holiday_id('2027-11-19'), '2027-11-19', 'Chhath Parva', 'festival')
ON CONFLICT ("date") DO NOTHING;

DROP FUNCTION IF EXISTS holiday_id(text);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP TABLE "LoginAttempt";
-- DROP TABLE "Holiday";
