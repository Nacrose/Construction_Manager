import { describe, it, expect } from "vitest";
import {
  calculateBillDeductions,
  calculateIpcPaymentSummary,
} from "@/lib/construction-tax";

describe("Central Construction Tax, TDS & Retention Engine", () => {
  describe("calculateBillDeductions", () => {
    it("computes standard 13% VAT, 1.5% TDS, and 5% Retention correctly", () => {
      const result = calculateBillDeductions({
        grossAmount: 100000,
        vatApplicable: true,
        vatRate: 13,
        tdsRate: 1.5,
        retentionRate: 5.0,
      });

      expect(result.grossAmount).toBe(100000);
      expect(result.vatAmount).toBe(13000);
      expect(result.totalBillAmount).toBe(113000);
      expect(result.tdsAmount).toBe(1500);
      expect(result.retentionAmount).toBe(5000);
      expect(result.totalDeductions).toBe(6500);
      expect(result.netPayable).toBe(106500); // 113,000 - 6,500
    });

    it("handles non-VAT purchases (e.g. sand/gravel local royalty or exempt)", () => {
      const result = calculateBillDeductions({
        grossAmount: 50000,
        vatApplicable: false,
        tdsRate: 1.5,
      });

      expect(result.grossAmount).toBe(50000);
      expect(result.vatAmount).toBe(0);
      expect(result.totalBillAmount).toBe(50000);
      expect(result.tdsAmount).toBe(750);
      expect(result.netPayable).toBe(49250);
    });
  });

  describe("calculateIpcPaymentSummary 3-Column Cumulative Model", () => {
    it("computes Cumulative 3-Column Totals matching Nepal Don Bosco IPC standard", () => {
      const contractWithoutVat = 35906434.20;
      const mobilizationPaid = 7181286.84;

      const summary = calculateIpcPaymentSummary({
        prevGross: 19448833.08,
        prevAdvance: 5834649.92,
        thisGross: 4488789.73,
        thisAdvance: 1346636.92,
        vatRate: 13,
        retentionRate: 5.0,
        tdsRate: 1.5,
        contractWithoutVat,
        mobilizationPaid,
      });

      expect(summary.cumulative.grossAmount).toBeCloseTo(23937622.81, 1);
      expect(summary.cumulative.totalBillAmount).toBeCloseTo(27049513.77, 1);
      expect(summary.cumulative.advanceRecovery).toBeCloseTo(7181286.84, 1);
      expect(summary.remainingMobilizationAdvance).toBe(0);
      expect(summary.cumulative.totalDeductions).toBeCloseTo(8737232.33, 1);
      expect(summary.cumulative.netPayable).toBeCloseTo(18312281.44, 1);
      expect(summary.progressPercent).toBeCloseTo(66.67, 1);
    });
  });
});
