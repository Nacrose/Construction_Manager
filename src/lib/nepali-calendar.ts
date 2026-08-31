/**
 * Comprehensive Bikram Sambat (BS ⇄ AD) Calendar Engine for Nepal
 *
 * Covers 100 years of astronomical month tables from 2000 BS (1943 AD)
 * to 2099 BS (2043 AD).
 *
 * Features:
 * - Precise bidirectional conversion: adToBs() and bsToAd()
 * - Devanagari numerals conversion: toDevanagariDigits() and toEnglishDigits()
 * - Nepali Month names (English & Devanagari)
 * - Nepali Weekday names (English & Devanagari)
 * - Nepali Fiscal Year generator (e.g. 2080/81, 2081/82)
 * - Saturday weekend (non-working) & Festival/Public Holiday detector
 * - Standardized string formatters
 */

export type NepaliMonth = {
  index: number; // 1-based (1=Baisakh, 12=Chaitra)
  name: string;
  nameNp: string;
  shortName: string;
  shortNameNp: string;
};

export type NepaliWeekday = {
  index: number; // 0=Sunday (Aaitabar), 6=Saturday (Sanibar)
  name: string;
  nameNp: string;
  shortName: string;
  shortNameNp: string;
  isWeekend: boolean; // Saturday is weekend in Nepal
};

export type NepaliDate = {
  year: number;
  month: number; // 1 to 12
  day: number; // 1 to 32
  monthName: string;
  monthNameNp: string;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  dayOfWeekName: string;
  dayOfWeekNameNp: string;
  formatted: string; // e.g. "2081-01-15"
  formattedNp: string; // e.g. "२०८१-०१-१५"
  display: string; // e.g. "2081 Baisakh 15"
  displayNp: string; // e.g. "२०८१ वैशाख १५"
  fiscalYear: string; // e.g. "2081/82"
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  adDate: Date;
};

export const NEPALI_MONTHS: NepaliMonth[] = [
  { index: 1, name: "Baisakh", nameNp: "वैशाख", shortName: "Bai", shortNameNp: "वै" },
  { index: 2, name: "Jestha", nameNp: "जेठ", shortName: "Jes", shortNameNp: "जे" },
  { index: 3, name: "Ashadh", nameNp: "असार", shortName: "Ash", shortNameNp: "अ" },
  { index: 4, name: "Shrawan", nameNp: "साउन", shortName: "Shr", shortNameNp: "सा" },
  { index: 5, name: "Bhadra", nameNp: "भदौ", shortName: "Bha", shortNameNp: "भ" },
  { index: 6, name: "Ashwin", nameNp: "असोज", shortName: "Ash", shortNameNp: "असो" },
  { index: 7, name: "Kartik", nameNp: "कात्तिक", shortName: "Kar", shortNameNp: "का" },
  { index: 8, name: "Mangsir", nameNp: "मंसिर", shortName: "Man", shortNameNp: "मं" },
  { index: 9, name: "Poush", nameNp: "पुस", shortName: "Pou", shortNameNp: "पु" },
  { index: 10, name: "Magh", nameNp: "माघ", shortName: "Mag", shortNameNp: "मा" },
  { index: 11, name: "Falgun", nameNp: "फागुन", shortName: "Fal", shortNameNp: "फा" },
  { index: 12, name: "Chaitra", nameNp: "चैत", shortName: "Cha", shortNameNp: "चै" },
];

export const NEPALI_WEEKDAYS: NepaliWeekday[] = [
  { index: 0, name: "Aaitabar", nameNp: "आइतबार", shortName: "Sun", shortNameNp: "आइत", isWeekend: false },
  { index: 1, name: "Sombar", nameNp: "सोमबार", shortName: "Mon", shortNameNp: "सोम", isWeekend: false },
  { index: 2, name: "Mangalbar", nameNp: "मंगलबार", shortName: "Tue", shortNameNp: "मङ्गल", isWeekend: false },
  { index: 3, name: "Budhabar", nameNp: "बुधबार", shortName: "Wed", shortNameNp: "बुध", isWeekend: false },
  { index: 4, name: "Bihibar", nameNp: "बिहीबार", shortName: "Thu", shortNameNp: "बिही", isWeekend: false },
  { index: 5, name: "Shukrabar", nameNp: "शुक्रबार", shortName: "Fri", shortNameNp: "शुक्र", isWeekend: false },
  { index: 6, name: "Sanibar", nameNp: "शनिबार", shortName: "Sat", shortNameNp: "शनि", isWeekend: true },
];

/**
 * 100-Year Bikram Sambat Calendar Matrix (2000 BS to 2099 BS).
 * Each row contains 12 numbers representing the number of days in each month
 * (Baisakh to Chaitra).
 */
export const BS_CALENDAR_DATA: Record<number, number[]> = {
  2000: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2001: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2002: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2003: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2004: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2005: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2006: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2007: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2008: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2009: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2010: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2011: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2012: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2013: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2014: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2015: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2016: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2017: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2018: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2019: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2020: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2021: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2022: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2023: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2024: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2025: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2026: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2027: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2028: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2029: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2030: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2031: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2032: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2033: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2034: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2035: [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2036: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2037: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2038: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2039: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2040: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2041: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2042: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2043: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2044: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2045: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2046: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2047: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2048: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2049: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2050: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2051: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2052: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2053: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2054: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2055: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2056: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2057: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2058: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2059: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2060: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2061: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2062: [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
  2063: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2064: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2065: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2066: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2067: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2068: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2070: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2071: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2072: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2073: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2074: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 30],
  2082: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2083: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2084: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2085: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2086: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2087: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2088: [30, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2089: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2090: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2091: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2092: [30, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2093: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2094: [31, 31, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2095: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2096: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2097: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2098: [31, 31, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
  2099: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
};

// Base Anchor Date: 2000 Baisakh 1 BS = 1943 April 14 AD (Wednesday)
const BASE_BS_YEAR = 2000;
const BASE_AD_MS = Date.UTC(1943, 3, 14); // 1943-04-14 UTC
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DEVANAGARI_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

/**
 * Convert numbers or strings with ASCII digits to Devanagari numerals.
 * e.g. 2081 -> "२०८१"
 */
export function toDevanagariDigits(val: number | string): string {
  return String(val).replace(/\d/g, (d) => DEVANAGARI_DIGITS[parseInt(d, 10)]);
}

/**
 * Convert Devanagari numerals to standard ASCII digits.
 * e.g. "२०८१" -> "2081"
 */
export function toEnglishDigits(str: string): string {
  return str.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

/**
 * Get number of days in a specific BS year and month.
 */
export function getDaysInBsMonth(year: number, month: number): number {
  const yearData = BS_CALENDAR_DATA[year];
  if (!yearData) return 30; // fallback
  return yearData[month - 1] ?? 30;
}

/**
 * Check if a date string in YYYY-MM-DD format is a public holiday in Nepal.
 */
const PUBLIC_HOLIDAYS_MAP: Record<string, string> = {
  "01-01": "Nepali New Year (Baisakh 1)",
  "01-18": "Labour Day (May 1)",
  "05-03": "Constitution Day (Asoj 3)",
  "09-27": "Prithvi Jayanti (Poush 27)",
  "11-07": "Democracy Day (Falgun 7)",
  "11-24": "International Women's Day",
};

/**
 * Convert Gregorian (AD) Date to Bikram Sambat (BS) NepaliDate.
 */
export function adToBs(dateInput: Date | string | number): NepaliDate {
  const date = typeof dateInput === "object" ? dateInput : new Date(dateInput);
  const targetUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

  let diffDays = Math.round((targetUtc - BASE_AD_MS) / MS_PER_DAY);
  if (diffDays < 0) {
    throw new Error(`Date ${date.toISOString()} precedes the supported BS calendar range (2000 BS+).`);
  }

  let currentYear = BASE_BS_YEAR;
  let currentMonth = 1;
  let currentDay = 1;

  while (diffDays > 0) {
    const daysInMonth = getDaysInBsMonth(currentYear, currentMonth);
    if (diffDays >= daysInMonth) {
      diffDays -= daysInMonth;
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    } else {
      currentDay += diffDays;
      diffDays = 0;
    }
  }

  const monthMeta = NEPALI_MONTHS[currentMonth - 1]!;
  const dayOfWeekIdx = date.getDay(); // 0=Sunday, 6=Saturday
  const weekdayMeta = NEPALI_WEEKDAYS[dayOfWeekIdx]!;

  const mm = String(currentMonth).padStart(2, "0");
  const dd = String(currentDay).padStart(2, "0");
  const formatted = `${currentYear}-${mm}-${dd}`;
  const formattedNp = `${toDevanagariDigits(currentYear)}-${toDevanagariDigits(mm)}-${toDevanagariDigits(dd)}`;
  const display = `${currentYear} ${monthMeta.name} ${currentDay}`;
  const displayNp = `${toDevanagariDigits(currentYear)} ${monthMeta.nameNp} ${toDevanagariDigits(currentDay)}`;

  const fiscalYear = currentMonth >= 4
    ? `${currentYear}/${String(currentYear + 1).slice(-2)}`
    : `${currentYear - 1}/${String(currentYear).slice(-2)}`;

  const holidayKey = `${mm}-${dd}`;
  const holidayName = PUBLIC_HOLIDAYS_MAP[holidayKey] ?? (weekdayMeta.isWeekend ? "Weekly Holiday (Saturday)" : null);
  const isHoliday = Boolean(holidayName);

  return {
    year: currentYear,
    month: currentMonth,
    day: currentDay,
    monthName: monthMeta.name,
    monthNameNp: monthMeta.nameNp,
    dayOfWeek: dayOfWeekIdx,
    dayOfWeekName: weekdayMeta.name,
    dayOfWeekNameNp: weekdayMeta.nameNp,
    formatted,
    formattedNp,
    display,
    displayNp,
    fiscalYear,
    isWeekend: weekdayMeta.isWeekend,
    isHoliday,
    holidayName,
    adDate: date,
  };
}

/**
 * Convert Bikram Sambat (BS) date to Gregorian (AD) Date.
 */
export function bsToAd(year: number, month: number, day: number): Date {
  if (year < BASE_BS_YEAR || year > 2099) {
    throw new Error(`BS Year ${year} is outside supported range (2000-2099).`);
  }
  if (month < 1 || month > 12) {
    throw new Error(`Invalid BS Month ${month}. Must be between 1 and 12.`);
  }
  const maxDays = getDaysInBsMonth(year, month);
  if (day < 1 || day > maxDays) {
    throw new Error(`Invalid BS Day ${day} for ${year}/${month}. Month has ${maxDays} days.`);
  }

  let totalDays = 0;

  // Add days for preceding years
  for (let y = BASE_BS_YEAR; y < year; y++) {
    const yearData = BS_CALENDAR_DATA[y];
    if (yearData) {
      totalDays += yearData.reduce((sum, d) => sum + d, 0);
    }
  }

  // Add days for preceding months in current year
  const currentYearData = BS_CALENDAR_DATA[year]!;
  for (let m = 1; m < month; m++) {
    totalDays += currentYearData[m - 1]!;
  }

  // Add remaining days
  totalDays += (day - 1);

  const targetMs = BASE_AD_MS + totalDays * MS_PER_DAY;
  return new Date(targetMs);
}

/**
 * Get current date in Bikram Sambat (BS).
 */
export function getCurrentBsDate(): NepaliDate {
  return adToBs(new Date());
}

/**
 * Format any AD date into clean Nepali representation.
 */
export function formatNepaliDate(
  dateInput: Date | string | number,
  formatType: "short" | "long" | "devanagari" | "dual" = "short"
): string {
  const bs = adToBs(dateInput);
  switch (formatType) {
    case "short":
      return bs.formatted;
    case "long":
      return bs.display;
    case "devanagari":
      return bs.displayNp;
    case "dual":
      return `${bs.formatted} BS (${bs.adDate.toISOString().slice(0, 10)} AD)`;
    default:
      return bs.formatted;
  }
}

/**
 * Format date to local calendar date string (YYYY-MM-DD) based on user's local timezone.
 * Avoids UTC date shifts (e.g. night-shift 00:00–05:45 NPT shifting to yesterday).
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
