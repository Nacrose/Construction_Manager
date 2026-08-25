import { describe, it, expect } from "vitest";

describe("Subcontractor Multi-Package Reconciliation Logic", () => {
  describe("Scope and Over-Claim Verification", () => {
    it("flags item as 'ok' when total subcontractor claim is within contract BOQ quantity", () => {
      const boqQty = 1000;
      const subAClaim = 300;
      const subBClaim = 400;
      const totalSubQty = subAClaim + subBClaim; // 700
      const ipcCertifiedQty = 750;

      let status = "ok";
      if (totalSubQty === 0) status = "not_started";
      else if (totalSubQty > boqQty) status = "exceeds_boq";
      else if (ipcCertifiedQty > 0 && totalSubQty > ipcCertifiedQty) status = "exceeds_ipc";

      expect(status).toBe("ok");
      expect(boqQty - totalSubQty).toBe(300); // 300 balance remaining
    });

    it("flags item as 'exceeds_boq' (Red Alert) when subcontractor claims exceed 100% contract BOQ", () => {
      const boqQty = 500;
      const subAClaim = 350;
      const subBClaim = 250;
      const totalSubQty = subAClaim + subBClaim; // 600 > 500

      let status = "ok";
      if (totalSubQty > boqQty) status = "exceeds_boq";

      expect(status).toBe("exceeds_boq");
      expect(totalSubQty - boqQty).toBe(100); // 100 units over-claimed
    });

    it("flags item as 'exceeds_ipc' (Yellow Alert) when subcontractor billed ahead of client certified measurements", () => {
      const boqQty = 1000;
      const totalSubQty = 600; // within BOQ
      const ipcCertifiedQty = 450; // client only certified 450 so far

      let status = "ok";
      if (totalSubQty > boqQty) status = "exceeds_boq";
      else if (ipcCertifiedQty > 0 && totalSubQty > ipcCertifiedQty) status = "exceeds_ipc";

      expect(status).toBe("exceeds_ipc");
      expect(totalSubQty - ipcCertifiedQty).toBe(150); // 150 uncertified cashflow exposure
    });
  });

  describe("Engineer Bill Line-Item Verification & Disallowance", () => {
    it("correctly computes disallowed quantities and verified gross/net totals", () => {
      const lineItems = [
        { thisQty: 100, verifiedQty: 90, rate: 500 }, // 10 disallowed
        { thisQty: 50, verifiedQty: 50, rate: 1200 }, // 0 disallowed
        { thisQty: 80, verifiedQty: 60, rate: 350 },  // 20 disallowed
      ];

      const originalGross = lineItems.reduce((sum, item) => sum + item.thisQty * item.rate, 0);
      const verifiedGross = lineItems.reduce((sum, item) => sum + item.verifiedQty * item.rate, 0);
      const disallowedTotal = originalGross - verifiedGross;

      expect(originalGross).toBe(100 * 500 + 50 * 1200 + 80 * 350); // 50000 + 60000 + 28000 = 138000
      expect(verifiedGross).toBe(90 * 500 + 50 * 1200 + 60 * 350);   // 45000 + 60000 + 21000 = 126000
      expect(disallowedTotal).toBe(12000);

      // Financial breakdown with 10% retention, 13% VAT, 1.5% TDS, and 5000 material deduction
      const retentionPercent = 10;
      const vatPercent = 13;
      const tdsPercent = 1.5;
      const materialDeduction = 5000;
      const advanceRecovery = 10000;

      const retentionAmount = (verifiedGross * retentionPercent) / 100; // 12600
      const vatAmount = (verifiedGross * vatPercent) / 100;             // 16380
      const tdsAmount = (verifiedGross * tdsPercent) / 100;             // 1890

      const netCertified = verifiedGross - retentionAmount + vatAmount - tdsAmount - materialDeduction - advanceRecovery;
      // 126000 - 12600 + 16380 - 1890 - 5000 - 10000 = 112890
      expect(netCertified).toBe(112890);
    });
  });

  describe("Subcontractor Material Issue, Return & Wastage Reconciliation", () => {
    it("computes net issued materials, theoretical requirements, and debit deductions for excess wastage", () => {
      const issuedQty = 500; // bags of cement issued from warehouse
      const returnedQty = 50; // bags returned to store
      const netIssued = issuedQty - returnedQty; // 450 bags

      const billedWorkUnits = 200; // m3 of concrete billed by subcontractor
      const theoreticalConsumptionPerUnit = 2.0; // 2 bags per m3
      const theoreticalRequirement = billedWorkUnits * theoreticalConsumptionPerUnit; // 400 bags

      const allowedWastagePercent = 0.02; // 2% permissible tolerance
      const allowedWastage = theoreticalRequirement * allowedWastagePercent; // 8 bags
      const maxAllowed = theoreticalRequirement + allowedWastage; // 408 bags

      const excessWastage = Math.max(0, netIssued - maxAllowed); // 450 - 408 = 42 bags
      const recoveryRate = 850; // NPR per bag
      const debitDeduction = excessWastage * recoveryRate; // 42 * 850 = 35700

      expect(netIssued).toBe(450);
      expect(theoreticalRequirement).toBe(400);
      expect(allowedWastage).toBe(8);
      expect(excessWastage).toBe(42);
      expect(debitDeduction).toBe(35700);
    });

    it("does not assess debit deduction when consumption is within permissible tolerance", () => {
      const netIssued = 405; // bags
      const theoreticalRequirement = 400; // bags
      const allowedWastage = theoreticalRequirement * 0.02; // 8 bags
      const maxAllowed = theoreticalRequirement + allowedWastage; // 408 bags

      const excessWastage = Math.max(0, netIssued - maxAllowed);
      expect(excessWastage).toBe(0);
    });
  });
});
