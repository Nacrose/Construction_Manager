import { describe, it, expect, afterEach } from "vitest";
import {
  adToBs,
  bsToAd,
  toDevanagariDigits,
  toEnglishDigits,
  getDaysInBsMonth,
  getCurrentBsDate,
  formatNepaliDate,
  NEPALI_MONTHS,
  NEPALI_WEEKDAYS,
} from "./nepali-calendar";

describe("Nepali Calendar Engine (Bikram Sambat BS ⇄ AD)", () => {
  describe("Known Historical & Landmark Date Verifications", () => {
    const landmarks = [
      { ad: "1943-04-14", bsY: 2000, bsM: 1, bsD: 1, label: "Base Anchor: 2000 Baisakh 1" },
      { ad: "2023-04-14", bsY: 2080, bsM: 1, bsD: 1, label: "2080 New Year (Baisakh 1)" },
      { ad: "2024-04-13", bsY: 2081, bsM: 1, bsD: 1, label: "2081 New Year (Baisakh 1)" },
      { ad: "2024-08-17", bsY: 2081, bsM: 5, bsD: 1, label: "2081 Bhadra 1" },
      { ad: "2025-04-13", bsY: 2082, bsM: 1, bsD: 1, label: "2082 New Year (Baisakh 1)" },
    ];

    it.each(landmarks)("converts $label ($ad) to $bsY/$bsM/$bsD", ({ ad, bsY, bsM, bsD }) => {
      const bs = adToBs(new Date(ad));
      expect(bs.year).toBe(bsY);
      expect(bs.month).toBe(bsM);
      expect(bs.day).toBe(bsD);

      // Verify reverse conversion
      const reversedAd = bsToAd(bsY, bsM, bsD);
      const iso = reversedAd.toISOString().slice(0, 10);
      expect(iso).toBe(ad);
    });
  });

  describe("Bidirectional Roundtrip Conversion Matrix (100 distinct BS dates)", () => {
    // Generate 100 test dates across years 2070 to 2095 and all 12 months
    const dates = Array.from({ length: 100 }, (_, i) => {
      const year = 2070 + (i % 25);
      const month = (i % 12) + 1;
      const maxDays = getDaysInBsMonth(year, month);
      const day = (i % maxDays) + 1;
      return { year, month, day };
    });

    it.each(dates)("performs exact lossless roundtrip for BS $year/$month/$day", ({ year, month, day }) => {
      const ad = bsToAd(year, month, day);
      expect(ad).toBeInstanceOf(Date);
      expect(Number.isNaN(ad.getTime())).toBe(false);

      const bs = adToBs(ad);
      expect(bs.year).toBe(year);
      expect(bs.month).toBe(month);
      expect(bs.day).toBe(day);
    });
  });

  describe("Devanagari Numerals & Number Formatting (50 numbers)", () => {
    const numbers = Array.from({ length: 50 }, (_, i) => 2000 + i * 2);

    it.each(numbers)("converts %i to Devanagari and back to English digits", (num) => {
      const devanagari = toDevanagariDigits(num);
      expect(devanagari).toMatch(/^[०-९]+$/);
      const english = toEnglishDigits(devanagari);
      expect(parseInt(english, 10)).toBe(num);
    });

    it("formats standard string numbers with embedded text", () => {
      expect(toDevanagariDigits("DPR-2081-05-15")).toBe("DPR-२०८१-०५-१५");
      expect(toEnglishDigits("DPR-२०८१-०५-१५")).toBe("DPR-2081-05-15");
    });
  });

  describe("Nepali Fiscal Year Resolution Across All 12 Months", () => {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    it.each(months)("computes correct fiscal year for 2081 month %i", (month) => {
      const ad = bsToAd(2081, month, 1);
      const bs = adToBs(ad);

      // Shrawan (Month 4) to Chaitra (Month 12) = 2081/82
      // Baisakh (Month 1) to Ashadh (Month 3) = 2080/81
      const expectedFy = month >= 4 ? "2081/82" : "2080/81";
      expect(bs.fiscalYear).toBe(expectedFy);
    });
  });

  describe("Nepali Months and Weekdays Registry Integrity", () => {
    it("has exactly 12 standard Nepali months in proper order", () => {
      expect(NEPALI_MONTHS.length).toBe(12);
      expect(NEPALI_MONTHS[0].name).toBe("Baisakh");
      expect(NEPALI_MONTHS[0].nameNp).toBe("वैशाख");
      expect(NEPALI_MONTHS[11].name).toBe("Chaitra");
      expect(NEPALI_MONTHS[11].nameNp).toBe("चैत");
    });

    it("has exactly 7 Nepali weekdays with Saturday as weekend", () => {
      expect(NEPALI_WEEKDAYS.length).toBe(7);
      expect(NEPALI_WEEKDAYS[0].name).toBe("Aaitabar"); // Sunday
      expect(NEPALI_WEEKDAYS[0].isWeekend).toBe(false);
      expect(NEPALI_WEEKDAYS[6].name).toBe("Sanibar"); // Saturday
      expect(NEPALI_WEEKDAYS[6].isWeekend).toBe(true);
    });
  });

  describe("Saturday Weekend & Holiday Identification (30 days)", () => {
    const saturdays = Array.from({ length: 30 }, (_, i) => {
      // 2024-05-04 is a Saturday
      const d = new Date("2024-05-04T00:00:00.000Z");
      d.setDate(d.getDate() + i * 7);
      return { adDate: d, weekNum: i + 1 };
    });

    it.each(saturdays)("flags Saturday (week $weekNum) as weekend and holiday", ({ adDate }) => {
      const bs = adToBs(adDate);
      expect(bs.dayOfWeek).toBe(6);
      expect(bs.isWeekend).toBe(true);
      expect(bs.isHoliday).toBe(true);
      expect(bs.holidayName).toContain("Saturday");
    });
  });

  describe("String Formatting & Display Helpers", () => {
    const testDate = new Date("2024-04-13T00:00:00.000Z"); // 2081-01-01

    it("formats short format (YYYY-MM-DD)", () => {
      expect(formatNepaliDate(testDate, "short")).toBe("2081-01-01");
    });

    it("formats long format (YYYY Month DD)", () => {
      expect(formatNepaliDate(testDate, "long")).toBe("2081 Baisakh 1");
    });

    it("formats Devanagari format (२०८१ वैशाख १)", () => {
      expect(formatNepaliDate(testDate, "devanagari")).toBe("२०८१ वैशाख १");
    });

    it("formats Dual format (BS and AD)", () => {
      expect(formatNepaliDate(testDate, "dual")).toBe("2081-01-01 BS (2024-04-13 AD)");
    });

    it("returns current BS date without crashing", () => {
      const current = getCurrentBsDate();
      expect(current.year).toBeGreaterThanOrEqual(2080);
      expect(current.month).toBeGreaterThanOrEqual(1);
      expect(current.month).toBeLessThanOrEqual(12);
      expect(current.day).toBeGreaterThanOrEqual(1);
      expect(current.day).toBeLessThanOrEqual(32);
    });
  });

  describe("Error Boundaries & Input Validation", () => {
    it("throws when year is out of supported range", () => {
      expect(() => bsToAd(1990, 1, 1)).toThrow(/outside supported range/);
      expect(() => bsToAd(2150, 1, 1)).toThrow(/outside supported range/);
    });

    it("throws when month is invalid", () => {
      expect(() => bsToAd(2081, 0, 1)).toThrow(/Invalid BS Month/);
      expect(() => bsToAd(2081, 13, 1)).toThrow(/Invalid BS Month/);
    });

    it("throws when day exceeds month max days", () => {
      expect(() => bsToAd(2081, 1, 35)).toThrow(/Invalid BS Day/);
      expect(() => bsToAd(2081, 1, 0)).toThrow(/Invalid BS Day/);
    });
  });
});

// ─── DB-backed holiday overrides ─────────────────────────────────────────────
import {
  isWorkingDay,
  isHoliday,
  getHolidayName,
} from "@/server/utils/nepal-calendar";
import { __setHolidayCacheForTests } from "@/server/utils/holiday-db";

describe("DB holiday cache (admin-editable overrides)", () => {
  afterEach(() => __setHolidayCacheForTests(null));

  it("falls back to the compiled constant when the DB has no rows for a year", () => {
    __setHolidayCacheForTests([]); // DB present but empty → every year unseen
    // 2026-04-13 (Nepali New Year) is a constant holiday.
    expect(isHoliday(new Date("2026-04-13T00:00:00Z"))).toBe(true);
    expect(isWorkingDay(new Date("2026-04-13T00:00:00Z"))).toBe(false);
  });

  it("DB rows are AUTHORITATIVE for a year they cover (constant ignored)", () => {
    // DB says 2026 has exactly one holiday: April 14 (corrected date).
    __setHolidayCacheForTests([{ date: "2026-04-14", name: "Nepali New Year (corrected)" }]);
    // Wrong constant date no longer applies:
    expect(isHoliday(new Date("2026-04-13T00:00:00Z"))).toBe(false);
    expect(isWorkingDay(new Date("2026-04-13T00:00:00Z"))).toBe(true);
    // Corrected date applies:
    expect(isHoliday(new Date("2026-04-14T00:00:00Z"))).toBe(true);
    expect(getHolidayName(new Date("2026-04-14T00:00:00Z"))).toBe("Nepali New Year (corrected)");
    // Constant Saturdays still hold (weekend logic is not overridable):
    expect(isWorkingDay(new Date("2026-04-11T00:00:00Z"))).toBe(false);
  });

  it("years without DB coverage keep using the constant (partial backfill)", () => {
    // Admin only maintained 2027 so far.
    __setHolidayCacheForTests([{ date: "2027-10-08", name: "Vijaya Dashami 2027" }]);
    expect(isHoliday(new Date("2027-10-08T00:00:00Z"))).toBe(true);      // DB row
    expect(isHoliday(new Date("2026-10-19T00:00:00Z"))).toBe(true);       // constant 2026 Dashain
    expect(isHoliday(new Date("2028-01-01T00:00:00Z"))).toBe(false);      // neither — 2028 open
  });
});
