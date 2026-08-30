#!/usr/bin/env python3
"""Generate the Holiday table seed SQL from the compiled NEPAL_HOLIDAYS constant.

Parses src/server/utils/nepal-calendar.ts, extracts every {date, name, type}
row, and writes INSERT statements for migration 20260830080000. 2027 rows are
appended by hand below (approximate lunar-calendar dates, admin-correctable).
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAL = ROOT / "src/server/utils/nepal-calendar.ts"

rows = []
pat = re.compile(
    r'\{\s*date:\s*"(\d{4}-\d{2}-\d{2})",\s*name:\s*"([^"]+)",\s*type:\s*"(\w+)"\s*\}'
)
inside = False
for line in CAL.read_text().splitlines():
    if "export const NEPAL_HOLIDAYS" in line:
        inside = True
    if inside:
        m = pat.search(line)
        if m:
            rows.append((m.group(1), m.group(2), m.group(3)))
        if inside and line.strip() == "];":
            break

print(f"parsed {len(rows)} constant holidays")

# 2027 approximations (lunar drift estimates; admin-correctable via the
# admin router). Fixed solar dates are reliable; festivals are best-effort.
H2027 = [
    ("2027-01-11", "Prithvi Jayanti", "public"),
    ("2027-02-19", "Democracy Day", "public"),
    ("2027-03-09", "Maha Shivaratri", "festival"),
    ("2027-03-22", "Holi (Hills)", "festival"),
    ("2027-03-23", "Holi (Terai)", "festival"),
    ("2027-03-08", "International Women's Day", "public"),
    ("2027-04-14", "Nepali New Year (Baisakh 1)", "public"),
    ("2027-04-15", "Baisakh 2", "public"),
    ("2027-05-01", "Labour Day", "public"),
    ("2027-05-21", "Buddha Jayanti", "festival"),
    # Dashain 2027 (approximate — Ghatasthapana ≈ Sep 30)
    ("2027-09-30", "Dashain Day 1 (Ghatasthapana)", "festival"),
    ("2027-10-01", "Dashain Day 2", "festival"),
    ("2027-10-02", "Dashain Day 3", "festival"),
    ("2027-10-03", "Dashain Day 4", "festival"),
    ("2027-10-04", "Dashain Day 5", "festival"),
    ("2027-10-05", "Dashain Day 6", "festival"),
    ("2027-10-06", "Dashain Day 7 (Phulpati)", "festival"),
    ("2027-10-07", "Dashain Day 8 (Maha Ashtami)", "festival"),
    ("2027-10-08", "Dashain Day 9 (Maha Nawami)", "festival"),
    ("2027-10-09", "Dashain Day 10 (Vijaya Dashami)", "festival"),
    ("2027-10-10", "Dashain Day 11", "festival"),
    ("2027-10-11", "Dashain Day 12", "festival"),
    ("2027-10-12", "Dashain Day 13", "festival"),
    ("2027-10-13", "Dashain Day 14 (Kojagrat Purnima)", "festival"),
    # Tihar 2027 (approximate)
    ("2027-10-27", "Tihar Day 1 (Kaag Tihar)", "festival"),
    ("2027-10-28", "Tihar Day 2 (Kukur Tihar)", "festival"),
    ("2027-10-29", "Tihar Day 3 (Laxmi Puja / Deepawali)", "festival"),
    ("2027-10-30", "Tihar Day 4 (Govardhan Puja / Mha Puja)", "festival"),
    ("2027-10-31", "Tihar Day 5 (Bhai Tika)", "festival"),
    ("2027-11-19", "Chhath Parva", "festival"),
]

all_rows = rows + H2027
# de-dup on date (2027 fixed dates must not collide with constant rows)
seen = set()
deduped = []
for d, n, t in all_rows:
    if d in seen:
        continue
    seen.add(d)
    deduped.append((d, n, t))
print(f"total seed rows (deduped): {len(deduped)}")

def esc(s: str) -> str:
    return s.replace("'", "''")

values = ",\n    ".join(
    f"(holiday_id('{d}'), '{d}', '{esc(n)}', '{t}')" for d, n, t in deduped
)

sql = f"""-- ═══════════════════════════════════════════════════════════════════════════
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
    {values}
ON CONFLICT ("date") DO NOTHING;

DROP FUNCTION IF EXISTS holiday_id(text);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP TABLE "LoginAttempt";
-- DROP TABLE "Holiday";
"""

out = ROOT / "prisma/migrations/20260830080000_holiday_loginattempt/migration.sql"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(sql)
print(f"wrote {out} ({len(sql)} bytes)")
