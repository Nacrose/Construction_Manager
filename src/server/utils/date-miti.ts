/**
 * Central Dual-Calendar (AD ⇄ BS Miti) & Fiscal Year Normalizer
 *
 * Provides single-source-of-truth date synchronization, Nepali Miti formatting,
 * and Fiscal Year / Quarter derivation for all construction, site reporting,
 * and accounting transactions.
 */
import { adToBs, bsToAd, type NepaliDate } from "@/lib/nepali-calendar";

export type NormalizedDateMiti = {
  adDate: Date;
  bsMiti: string; // e.g. "2081-05-14"
  bsMitiNp: string; // e.g. "२०८१-०५-१४"
  fiscalYear: string; // e.g. "2081/82"
  nepaliYear: number;
  nepaliMonth: number;
  nepaliDay: number;
  monthName: string; // e.g. "Bhadra"
  monthNameNp: string; // e.g. "भदौ"
  quarter: number; // 1 to 4 in Nepali Fiscal Year
  quarterName: string; // e.g. "Q1 (साउन - असोज)"
  isWeekend: boolean;
};

/**
 * Determine the Nepal Government Fiscal Quarter (Q1 to Q4)
 * - Q1: Shrawan (4), Bhadra (5), Ashwin (6)
 * - Q2: Kartik (7), Mangsir (8), Poush (9)
 * - Q3: Magh (10), Falgun (11), Chaitra (12)
 * - Q4: Baisakh (1), Jestha (2), Ashadh (3)
 */
export function getNepaliFiscalQuarter(month: number): { quarter: number; name: string } {
  if (month >= 4 && month <= 6) {
    return { quarter: 1, name: "Q1 (साउन - असोज)" };
  } else if (month >= 7 && month <= 9) {
    return { quarter: 2, name: "Q2 (कात्तिक - पुस)" };
  } else if (month >= 10 && month <= 12) {
    return { quarter: 3, name: "Q3 (माघ - चैत)" };
  } else {
    return { quarter: 4, name: "Q4 (वैशाख - असार)" };
  }
}

/**
 * Normalizes input date/miti into a synchronized dual-calendar record.
 */
export function normalizeDateMiti(input?: {
  adDate?: Date | string | null;
  bsMiti?: string | null;
}): NormalizedDateMiti {
  let nepaliDate: NepaliDate;
  let targetAdDate: Date;

  if (input?.bsMiti && typeof input.bsMiti === "string" && input.bsMiti.trim()) {
    try {
      const parts = input.bsMiti.trim().split("-").map((p) => parseInt(p, 10));
      if (parts.length === 3 && !parts.some(isNaN)) {
        targetAdDate = bsToAd(parts[0], parts[1], parts[2]);
        nepaliDate = adToBs(targetAdDate);
      } else {
        targetAdDate = input?.adDate ? new Date(input.adDate) : new Date();
        nepaliDate = adToBs(targetAdDate);
      }
    } catch {
      targetAdDate = input?.adDate ? new Date(input.adDate) : new Date();
      nepaliDate = adToBs(targetAdDate);
    }
  } else if (input?.adDate) {
    targetAdDate = typeof input.adDate === "string" ? new Date(input.adDate) : input.adDate;
    if (isNaN(targetAdDate.getTime())) {
      targetAdDate = new Date();
    }
    nepaliDate = adToBs(targetAdDate);
  } else {
    targetAdDate = new Date();
    nepaliDate = adToBs(targetAdDate);
  }

  const qInfo = getNepaliFiscalQuarter(nepaliDate.month);

  return {
    adDate: targetAdDate,
    bsMiti: nepaliDate.formatted,
    bsMitiNp: nepaliDate.formattedNp,
    fiscalYear: nepaliDate.fiscalYear,
    nepaliYear: nepaliDate.year,
    nepaliMonth: nepaliDate.month,
    nepaliDay: nepaliDate.day,
    monthName: nepaliDate.monthName,
    monthNameNp: nepaliDate.monthNameNp,
    quarter: qInfo.quarter,
    quarterName: qInfo.name,
    isWeekend: nepaliDate.isWeekend,
  };
}
