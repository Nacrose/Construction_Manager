import { describe, it, expect } from "vitest";

describe("Organization-Level Finance & Central Payables Suite", () => {
  it("should aggregate open bills across multiple projects by supplier", () => {
    const rawBills = [
      {
        id: "b1",
        projectId: "proj_road",
        projectCode: "RD-01",
        supplierName: "Shivam Cement",
        supplierPan: "301245678",
        netPayable: 400000,
        paidAmount: 0,
      },
      {
        id: "b2",
        projectId: "proj_bld",
        projectCode: "BLD-02",
        supplierName: "Shivam Cement",
        supplierPan: "301245678",
        netPayable: 650000,
        paidAmount: 150000,
      },
      {
        id: "b3",
        projectId: "proj_culvert",
        projectCode: "CUL-03",
        supplierName: "Shivam Cement",
        supplierPan: "301245678",
        netPayable: 200000,
        paidAmount: 0,
      },
      {
        id: "b4",
        projectId: "proj_road",
        projectCode: "RD-01",
        supplierName: "Brij Steel",
        supplierPan: "302345679",
        netPayable: 1200000,
        paidAmount: 200000,
      },
    ];

    const supplierMap = new Map<string, { totalDue: number; billsCount: number; projectCodes: string[] }>();

    rawBills.forEach((b) => {
      const balance = Math.max(0, b.netPayable - b.paidAmount);
      const key = `${b.supplierName}_${b.supplierPan}`;
      if (!supplierMap.has(key)) {
        supplierMap.set(key, { totalDue: 0, billsCount: 0, projectCodes: [] });
      }
      const sup = supplierMap.get(key)!;
      sup.totalDue += balance;
      sup.billsCount += 1;
      if (!sup.projectCodes.includes(b.projectCode)) {
        sup.projectCodes.push(b.projectCode);
      }
    });

    const shivam = supplierMap.get("Shivam Cement_301245678")!;
    expect(shivam.billsCount).toBe(3);
    expect(shivam.totalDue).toBe(400000 + 500000 + 200000); // 1,100,000
    expect(shivam.projectCodes).toEqual(["RD-01", "BLD-02", "CUL-03"]);

    const brij = supplierMap.get("Brij Steel_302345679")!;
    expect(brij.billsCount).toBe(1);
    expect(brij.totalDue).toBe(1000000);
  });

  it("should correctly compute multi-bill central cheque allocation with 1.5% TDS", () => {
    const selectedBills = [
      { billId: "b1", amountToPay: 400000, tdsPercent: 1.5 },
      { billId: "b2", amountToPay: 500000, tdsPercent: 1.5 },
    ];

    const allocations = selectedBills.map((b) => {
      const tds = (b.amountToPay * b.tdsPercent) / 100;
      const netPaid = b.amountToPay - tds;
      return { ...b, tds, netPaid };
    });

    const totalGross = allocations.reduce((s, a) => s + a.amountToPay, 0); // 900,000
    const totalTds = allocations.reduce((s, a) => s + a.tds, 0); // 13,500
    const totalCheque = allocations.reduce((s, a) => s + a.netPaid, 0); // 886,500

    expect(totalGross).toBe(900000);
    expect(totalTds).toBe(13500);
    expect(totalCheque).toBe(886500);
  });

  it("should maintain running balance in multi-project party statement", () => {
    const events = [
      { date: "2026-08-01", type: "bill", debit: 0, credit: 500000 },
      { date: "2026-08-05", type: "bill", debit: 0, credit: 300000 },
      { date: "2026-08-10", type: "payment", debit: 400000, credit: 0 },
      { date: "2026-08-15", type: "bill", debit: 0, credit: 200000 },
      { date: "2026-08-20", type: "payment", debit: 300000, credit: 0 },
    ];

    let running = 0;
    const statements = events.map((e) => {
      running += e.credit - e.debit;
      return { ...e, runningBalance: running };
    });

    expect(statements[0].runningBalance).toBe(500000);
    expect(statements[1].runningBalance).toBe(800000);
    expect(statements[2].runningBalance).toBe(400000);
    expect(statements[3].runningBalance).toBe(600000);
    expect(statements[4].runningBalance).toBe(300000);

    const totalBilled = events.reduce((s, e) => s + e.credit, 0);
    const totalPaid = events.reduce((s, e) => s + e.debit, 0);
    expect(totalBilled).toBe(1000000);
    expect(totalPaid).toBe(700000);
    expect(totalBilled - totalPaid).toBe(300000);
  });
});
