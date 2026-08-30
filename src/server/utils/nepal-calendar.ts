/**
 * Nepal Holiday Calendar + Working Day Calculator
 *
 * Nepal-specific calendar logic:
 * - Saturday is the weekend (NOT Sunday)
 * - Major festivals: Dashain, Tihar, Holi, etc.
 * - Working hours: 8am-12pm, 1pm-5pm (Sun-Fri)
 *
 * This module provides:
 * - isWorkingDay(date) — checks if a date is a working day
 * - countWorkingDays(start, end) — counts working days between dates
 * - addWorkingDays(start, days) — adds working days to a date
 * - NEPAL_HOLIDAYS — predefined Nepal public holidays
 *
 * ⚠️ CLIENT-SAFE MODULE — imported by client components (Gantt timeline
 * holiday labels). It must NEVER import `@/lib/db` (or anything else that
 * reaches it): db.ts imports `node:module`, which cannot exist in a browser
 * chunk and panics Turbopack at build time. The DB-backed cache is REFRESHED
 * by `./holiday-db` (server-only) via `__replaceDbHolidayCache` below.
 * `src/lib/client-graph-boundary.test.ts` enforces this boundary.
 */

export type Holiday = {
  date: string; // YYYY-MM-DD
  name: string;
  type: "public" | "festival" | "optional";
};

// Nepal public holidays 2025-2026 (major ones)
// Note: Many Nepali festivals follow the lunar calendar (Bikram Sambat)
// and shift by a few days each year. These are approximate dates.
export const NEPAL_HOLIDAYS: Holiday[] = [
  // 2025
  { date: "2025-01-11", name: "Prithvi Jayanti", type: "public" },
  { date: "2025-02-19", name: "Democracy Day", type: "public" },
  { date: "2025-02-26", name: "Maha Shivaratri", type: "festival" },
  { date: "2025-03-08", name: "International Women's Day", type: "public" },
  { date: "2025-03-14", name: "Holi (Terai)", type: "festival" },
  { date: "2025-03-13", name: "Holi (Hills)", type: "festival" },
  { date: "2025-04-13", name: "Nepali New Year (Baisakh 1)", type: "public" },
  { date: "2025-04-14", name: "Baisakh 2", type: "public" },
  { date: "2025-05-01", name: "Labour Day", type: "public" },
  { date: "2025-05-26", name: "Buddha Jayanti", type: "festival" },
  // Dashain 2025 (approximate — 15 days)
  { date: "2025-09-22", name: "Dashain Day 1 (Ghatasthapana)", type: "festival" },
  { date: "2025-09-23", name: "Dashain Day 2", type: "festival" },
  { date: "2025-09-24", name: "Dashain Day 3", type: "festival" },
  { date: "2025-09-25", name: "Dashain Day 4", type: "festival" },
  { date: "2025-09-26", name: "Dashain Day 5", type: "festival" },
  { date: "2025-09-27", name: "Dashain Day 6 (Phulpati)", type: "festival" },
  { date: "2025-09-28", name: "Dashain Day 7 (Maha Ashtami)", type: "festival" },
  { date: "2025-09-29", name: "Dashain Day 8 (Maha Nawami)", type: "festival" },
  { date: "2025-09-30", name: "Dashain Day 9 (Vijaya Dashami)", type: "festival" },
  { date: "2025-10-01", name: "Dashain Day 10 (Ekadashi)", type: "festival" },
  { date: "2025-10-02", name: "Dashain Day 11", type: "festival" },
  { date: "2025-10-03", name: "Dashain Day 12", type: "festival" },
  { date: "2025-10-04", name: "Dashain Day 13", type: "festival" },
  { date: "2025-10-05", name: "Dashain Day 14 (Kojagrat Purnima)", type: "festival" },
  // Tihar 2025 (approximate — 5 days)
  { date: "2025-10-19", name: "Tihar Day 1 (Kaag Tihar)", type: "festival" },
  { date: "2025-10-20", name: "Tihar Day 2 (Kukur Tihar)", type: "festival" },
  { date: "2025-10-21", name: "Tihar Day 3 (Laxmi Puja / Deepawali)", type: "festival" },
  { date: "2025-10-22", name: "Tihar Day 4 (Govardhan Puja / Mha Puja)", type: "festival" },
  { date: "2025-10-23", name: "Tihar Day 5 (Bhai Tika)", type: "festival" },
  { date: "2025-11-20", name: "Chhath Parva", type: "festival" },
  { date: "2025-12-29", name: "Constitution Day", type: "public" },

  // 2026
  { date: "2026-01-11", name: "Prithvi Jayanti", type: "public" },
  { date: "2026-02-19", name: "Democracy Day", type: "public" },
  { date: "2026-02-15", name: "Maha Shivaratri", type: "festival" },
  { date: "2026-03-03", name: "Holi (Hills)", type: "festival" },
  { date: "2026-03-04", name: "Holi (Terai)", type: "festival" },
  { date: "2026-04-13", name: "Nepali New Year (Baisakh 1)", type: "public" },
  { date: "2026-04-14", name: "Baisakh 2", type: "public" },
  { date: "2026-05-01", name: "Labour Day", type: "public" },
  { date: "2026-05-15", name: "Buddha Jayanti", type: "festival" },
  // Dashain 2026 (approximate)
  { date: "2026-10-11", name: "Dashain Day 1 (Ghatasthapana)", type: "festival" },
  { date: "2026-10-12", name: "Dashain Day 2", type: "festival" },
  { date: "2026-10-13", name: "Dashain Day 3", type: "festival" },
  { date: "2026-10-14", name: "Dashain Day 4", type: "festival" },
  { date: "2026-10-15", name: "Dashain Day 5", type: "festival" },
  { date: "2026-10-16", name: "Dashain Day 6 (Phulpati)", type: "festival" },
  { date: "2026-10-17", name: "Dashain Day 7 (Maha Ashtami)", type: "festival" },
  { date: "2026-10-18", name: "Dashain Day 8 (Maha Nawami)", type: "festival" },
  { date: "2026-10-19", name: "Dashain Day 9 (Vijaya Dashami)", type: "festival" },
  { date: "2026-10-20", name: "Dashain Day 10", type: "festival" },
  // Tihar 2026 (approximate)
  { date: "2026-11-08", name: "Tihar Day 1 (Kaag Tihar)", type: "festival" },
  { date: "2026-11-09", name: "Tihar Day 2 (Kukur Tihar)", type: "festival" },
  { date: "2026-11-10", name: "Tihar Day 3 (Laxmi Puja)", type: "festival" },
  { date: "2026-11-11", name: "Tihar Day 4 (Govardhan/Mha Puja)", type: "festival" },
  { date: "2026-11-12", name: "Tihar Day 5 (Bhai Tika)", type: "festival" },
];

// (The compiled constant stays exported above; holiday lookups now go
// through the year-aware cache below, which prefers DB-managed rows.)

// ─────────────────────────────────────────────────────────────────────────────
// DB-backed holiday overrides (admin-editable)
// ─────────────────────────────────────────────────────────────────────────────
// The compiled constant above is a FALLBACK: it is approximate (lunar-calendar
// festivals drift a few days per year) and ends at 2026 — any 2027+ schedule
// would silently plan through Dashain. Administrators can maintain the
// `Holiday` table (seeded from this constant by migration 20260830070000);
// when the DB has ANY rows for a given year, those rows are AUTHORITATIVE
// for that year (so wrong constant dates can be corrected, not just added to).
// The DB read + TTL cache live in `./holiday-db` (server-only); this module
// only holds the swap-in primitive and the year-aware lookup.

export type HolidayRow = { date: string; name: string };

type YearHolidays = { dates: Set<string>; names: Map<string, string> };

/** Constant-derived holidays grouped by year (computed once at module load). */
const CONSTANT_BY_YEAR = new Map<number, YearHolidays>();
for (const h of NEPAL_HOLIDAYS) {
  const year = Number(h.date.slice(0, 4));
  let entry = CONSTANT_BY_YEAR.get(year);
  if (!entry) {
    entry = { dates: new Set(), names: new Map() };
    CONSTANT_BY_YEAR.set(year, entry);
  }
  entry.dates.add(h.date);
  entry.names.set(h.date, h.name);
}

/** DB rows grouped by year — authoritative for any year it covers. */
let DB_BY_YEAR = new Map<number, YearHolidays>();
const EMPTY_YEAR: YearHolidays = { dates: new Set(), names: new Map() };

/**
 * Swap the DB-derived holiday cache wholesale. Called ONLY by
 * `./holiday-db` (server): after a successful `Holiday.findMany`, or by the
 * test seam. `null` clears the cache back to constant-only lookups.
 * Kept here (not in holiday-db) because the cache it replaces lives here.
 */
export function __replaceDbHolidayCache(rows: HolidayRow[] | null): void {
  const byYear = new Map<number, YearHolidays>();
  if (rows) {
    for (const r of rows) {
      const year = Number(r.date.slice(0, 4));
      if (!Number.isFinite(year) || year < 2000) continue;
      let entry = byYear.get(year);
      if (!entry) {
        entry = { dates: new Set(), names: new Map() };
        byYear.set(year, entry);
      }
      entry.dates.add(r.date);
      entry.names.set(r.date, r.name);
    }
  }
  DB_BY_YEAR = byYear;
}

/** Effective holidays for a year: DB rows when present, else the constant. */
function yearHolidays(year: number): YearHolidays {
  // `has` (not the map lookup) is the authority test: a year the admin
  // deliberately emptied in the DB stays empty — no constant resurrection.
  if (DB_BY_YEAR.has(year)) return DB_BY_YEAR.get(year) ?? EMPTY_YEAR;
  return CONSTANT_BY_YEAR.get(year) ?? EMPTY_YEAR;
}

/**
 * Check if a date is a working day in Nepal.
 * - Saturday (day 6) is the weekend
 * - Public holidays are non-working
 * - Sunday-Friday are working days (unless holiday)
 */
export function isWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday
  if (dayOfWeek === 6) return false; // Saturday is weekend in Nepal

  const dateStr = date.toISOString().slice(0, 10);
  if (yearHolidays(Number(dateStr.slice(0, 4))).dates.has(dateStr)) return false;

  return true;
}

/**
 * Count working days between two dates (inclusive).
 */
export function countWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (isWorkingDay(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Add N working days to a date. Returns the resulting date.
 * Skips Saturdays and holidays.
 */
export function addWorkingDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result)) added++;
  }
  return result;
}

/**
 * Get all holidays within a date range.
 */
export function getHolidaysInRange(start: Date, end: Date): Holiday[] {
  return NEPAL_HOLIDAYS.filter(h => {
    const d = new Date(h.date);
    return d >= start && d <= end;
  });
}

/**
 * Check if a specific date is a holiday.
 */
export function isHoliday(date: Date): boolean {
  const dateStr = date.toISOString().slice(0, 10);
  return yearHolidays(Number(dateStr.slice(0, 4))).dates.has(dateStr);
}

/**
 * Get holiday name for a date (if it's a holiday).
 */
export function getHolidayName(date: Date): string | null {
  const dateStr = date.toISOString().slice(0, 10);
  return yearHolidays(Number(dateStr.slice(0, 4))).names.get(dateStr) ?? null;
}
