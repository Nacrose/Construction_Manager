/**
 * Tests for getHolidaysInRange — the holiday-override cache path (B2 fix).
 *
 * Pins:
 *   - Range queries read the year-aware cache (DB-authoritative per year,
 *     compiled constant as fallback) — NOT the raw NEPAL_HOLIDAYS constant,
 *     which the pre-fix implementation filtered directly and therefore
 *     ignored admin-corrected dates.
 *   - A year the admin deliberately emptied in the DB stays empty.
 *   - Range boundaries are inclusive; multi-year ranges work.
 *   - Row types survive the cache (DB rows default "public").
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  getHolidaysInRange,
  isHoliday,
  __replaceDbHolidayCache,
  type HolidayRow,
} from "./nepal-calendar";

beforeEach(() => {
  // Reset to constant-only lookups between tests (the seam's documented
  // null-clears behavior).
  __replaceDbHolidayCache(null);
});

describe("getHolidaysInRange", () => {
  it("falls back to the compiled constant when the DB has no rows for the year", () => {
    // 2025 Dashain window from the constant.
    const rows = getHolidaysInRange(new Date("2025-09-28"), new Date("2025-09-30"));
    expect(rows.map((r) => r.date)).toEqual(["2025-09-28", "2025-09-29", "2025-09-30"]);
    expect(rows[2].name).toContain("Dashain");
  });

  it("B2 regression: prefers DB-authoritative rows over the constant", () => {
    // Constant says Dashain Vijaya Dashami = 2025-09-30; the admin corrected
    // it to 2025-10-01 in the Holiday table.
    const dbRows: HolidayRow[] = [
      { date: "2025-10-01", name: "Vijaya Dashami (corrected)", type: "festival" },
    ];
    __replaceDbHolidayCache(dbRows);

    expect(isHoliday(new Date("2025-09-30"))).toBe(false); // constant date NO longer applies
    const rows = getHolidaysInRange(new Date("2025-09-28"), new Date("2025-10-02"));
    expect(rows.map((r) => r.date)).toEqual(["2025-10-01"]);
    expect(rows[0].name).toBe("Vijaya Dashami (corrected)");
    expect(rows[0].type).toBe("festival");
  });

  it("a year the admin deliberately emptied stays empty", () => {
    __replaceDbHolidayCache([{ date: "2024-12-31", name: "kept", type: "public" }]);
    // 2025 has NO DB rows → constant applies (authority test is per-year).
    const rows = getHolidaysInRange(new Date("2025-01-01"), new Date("2025-12-31"));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("spans multi-year ranges with inclusive boundaries", () => {
    __replaceDbHolidayCache(null);
    const rows = getHolidaysInRange(new Date("2025-12-29"), new Date("2026-01-11"));
    expect(rows.map((r) => r.date)).toEqual(["2025-12-29", "2026-01-11"]);
  });
});
