import { describe, it, expect } from "vitest";
import { normalizeDateMiti, getNepaliFiscalQuarter } from "./date-miti";

describe("Central Dual-Calendar (AD ⇄ BS Miti) Normalizer", () => {
  describe("getNepaliFiscalQuarter", () => {
    it("determines Q1 for Shrawan (month 4) to Ashwin (month 6)", () => {
      expect(getNepaliFiscalQuarter(4).quarter).toBe(1);
      expect(getNepaliFiscalQuarter(5).quarter).toBe(1);
      expect(getNepaliFiscalQuarter(6).quarter).toBe(1);
    });

    it("determines Q2 for Kartik (month 7) to Poush (month 9)", () => {
      expect(getNepaliFiscalQuarter(7).quarter).toBe(2);
      expect(getNepaliFiscalQuarter(9).quarter).toBe(2);
    });

    it("determines Q3 for Magh (month 10) to Chaitra (month 12)", () => {
      expect(getNepaliFiscalQuarter(10).quarter).toBe(3);
      expect(getNepaliFiscalQuarter(12).quarter).toBe(3);
    });

    it("determines Q4 for Baisakh (month 1) to Ashadh (month 3)", () => {
      expect(getNepaliFiscalQuarter(1).quarter).toBe(4);
      expect(getNepaliFiscalQuarter(3).quarter).toBe(4);
    });
  });

  describe("normalizeDateMiti", () => {
    it("converts AD date 2024-08-29 to correct BS Miti and Fiscal Year", () => {
      const res = normalizeDateMiti({ adDate: new Date("2024-08-29T00:00:00Z") });
      expect(res.nepaliYear).toBe(2081);
      expect(res.nepaliMonth).toBe(5); // Bhadra
      expect(res.monthName).toBe("Bhadra");
      expect(res.fiscalYear).toBe("2081/82");
      expect(res.quarter).toBe(1);
    });

    it("converts BS Miti 2081-01-01 to correct AD date", () => {
      const res = normalizeDateMiti({ bsMiti: "2081-01-01" });
      expect(res.nepaliYear).toBe(2081);
      expect(res.nepaliMonth).toBe(1); // Baisakh
      expect(res.adDate.getFullYear()).toBe(2024);
      expect(res.fiscalYear).toBe("2080/81");
      expect(res.quarter).toBe(4);
    });

    it("defaults to current date when no parameters are provided", () => {
      const res = normalizeDateMiti();
      expect(res.bsMiti).toBeDefined();
      expect(res.fiscalYear).toBeDefined();
      expect(res.quarter).toBeGreaterThanOrEqual(1);
      expect(res.quarter).toBeLessThanOrEqual(4);
    });
  });
});
