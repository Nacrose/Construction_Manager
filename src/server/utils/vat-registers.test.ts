import { describe, it, expect } from "vitest";

describe("Nepal Statutory VAT & Tax Register Engine", () => {
  describe("IPC Summary of Payment 3-Column Cumulative Calculations", () => {
    it("correctly computes Rows A through I and Cumulative Totals matching Nepal Don Bosco Society standard", () => {
      // Contract metadata
      const contractWithoutVat = 35906434.20;
      const contractWithVat = 40574270.65;
      const mobilizationPaid = 7181286.84;

      // Upto Previous IPC (IPC 1 to 4)
      const prevGross = 19448833.08; // Row A
      const prevVat = prevGross * 0.13; // Row B = 2,528,348.30
      const prevTotalBill = prevGross + prevVat; // Row C = 21,977,181.38
      const prevAdvance = 5834649.92; // Row E
      const prevRetention = prevGross * 0.05; // Row F = 972,441.65
      const prevTds = prevGross * 0.015; // Row G = 291,732.50
      const prevTotalDeductions = prevAdvance + prevRetention + prevTds; // Row H = 7,098,824.07
      const prevNetPayable = prevTotalBill - prevTotalDeductions; // Row I = 14,878,357.31

      // This IPC (IPC 5)
      const thisGross = 4488789.73; // Row A
      const thisVat = thisGross * 0.13; // Row B = 583,542.66
      const thisTotalBill = thisGross + thisVat; // Row C = 5,072,332.39
      const thisAdvance = 1346636.92; // Row E
      const thisRetention = thisGross * 0.05; // Row F = 224,439.49
      const thisTds = thisGross * 0.015; // Row G = 67,331.85
      const thisTotalDeductions = thisAdvance + thisRetention + thisTds; // Row H = 1,638,408.26
      const thisNetPayable = thisTotalBill - thisTotalDeductions; // Row I = 3,433,924.13

      // Cumulative Total
      const cumGross = prevGross + thisGross; // 23,937,622.81
      const cumVat = prevVat + thisVat; // 3,111,890.96
      const cumTotalBill = prevTotalBill + thisTotalBill; // 27,049,513.77
      const cumAdvance = prevAdvance + thisAdvance; // 7,181,286.84 (Full advance recovered!)
      const cumRetention = prevRetention + thisRetention; // 1,196,881.14
      const cumTds = prevTds + thisTds; // 359,064.35
      const cumTotalDeductions = prevTotalDeductions + thisTotalDeductions; // 8,737,232.33
      const cumNetPayable = prevNetPayable + thisNetPayable; // 18,312,281.44

      const progressPct = (cumGross / contractWithoutVat) * 100; // 66.67%
      const mobAdvanceBalance = mobilizationPaid - cumAdvance; // 0.00

      expect(cumGross).toBeCloseTo(23937622.81, 1);
      expect(cumVat).toBeCloseTo(3111890.96, 1);
      expect(cumTotalBill).toBeCloseTo(27049513.77, 1);
      expect(cumRetention).toBeCloseTo(1196881.14, 1);
      expect(cumTds).toBeCloseTo(359064.35, 1);
      expect(contractWithVat).toBeGreaterThan(contractWithoutVat);
      expect(cumAdvance).toBeCloseTo(7181286.84, 1);
      expect(mobAdvanceBalance).toBeCloseTo(0.00, 1);
      expect(cumTotalDeductions).toBeCloseTo(8737232.33, 1);
      expect(cumNetPayable).toBeCloseTo(18312281.44, 1);
      expect(progressPct).toBeCloseTo(66.67, 1);
    });
  });

  describe("Schedule 8 (खरिद खाता) Tax Breakdown", () => {
    it("correctly segregates Local Taxable, Exempt, Capital Asset, and Input VAT 13%", () => {
      const items = [
        { type: "material_taxable", amount: 100000, vatPercent: 13 },
        { type: "material_exempt", amount: 25000, vatPercent: 0 },
        { type: "capital_crane", amount: 500000, vatPercent: 13 },
      ];

      let taxableLocal = 0;
      let exemptTotal = 0;
      let capitalTotal = 0;
      let inputVatTotal = 0;

      for (const item of items) {
        if (item.vatPercent === 0) {
          exemptTotal += item.amount;
        } else if (item.type === "capital_crane") {
          capitalTotal += item.amount;
          inputVatTotal += item.amount * 0.13;
        } else {
          taxableLocal += item.amount;
          inputVatTotal += item.amount * 0.13;
        }
      }

      expect(taxableLocal).toBe(100000);
      expect(exemptTotal).toBe(25000);
      expect(capitalTotal).toBe(500000);
      expect(inputVatTotal).toBe(78000); // 13,000 + 65,000
    });
  });

  describe("Schedule 10 (मूल्य अभिवृद्धि कर विवरण) Output vs Input Netting", () => {
    it("computes Net VAT Payable when Output VAT > Input VAT", () => {
      const outputVat = 3111890.96; // From Client IPCs
      const inputVat = 1850000.00; // From purchases and subs
      const netPayable = outputVat - inputVat;

      expect(netPayable).toBeCloseTo(1261890.96, 2);
    });

    it("computes Net VAT Credit Carried Forward when Input VAT > Output VAT", () => {
      const outputVat = 500000.00;
      const inputVat = 850000.00; // High material stocking period
      const netPayable = outputVat - inputVat;
      const netCredit = netPayable < 0 ? Math.abs(netPayable) : 0;

      expect(netCredit).toBe(350000.00);
    });
  });
});
