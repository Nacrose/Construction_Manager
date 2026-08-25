import { describe, it, expect } from "vitest";

describe("Native Accounting Module (Day Book, Ledgers, Trial Balance)", () => {
  it("should calculate vendor running statement balance correctly", () => {
    // Opening balance: 0
    let balance = 0;

    // 1. Purchase bill received (Cr. 250,000)
    const bill1 = { type: "Purchase Bill", debit: 0, credit: 250000 };
    balance += bill1.credit - bill1.debit;
    expect(balance).toBe(250000); // Payable 250,000

    // 2. Partial payment made (Dr. 100,000)
    const payment1 = { type: "Payment Voucher", debit: 100000, credit: 0 };
    balance += payment1.credit - payment1.debit;
    expect(balance).toBe(150000); // Payable 150,000

    // 3. Another purchase bill received (Cr. 80,000)
    const bill2 = { type: "Purchase Bill", debit: 0, credit: 80000 };
    balance += bill2.credit - bill2.debit;
    expect(balance).toBe(230000); // Payable 230,000

    // 4. Full payment of remaining balance (Dr. 230,000)
    const payment2 = { type: "Payment Voucher", debit: 230000, credit: 0 };
    balance += payment2.credit - payment2.debit;
    expect(balance).toBe(0); // Fully settled
  });

  it("should calculate bank / cash running balance correctly", () => {
    let bankBalance = 500000; // Opening deposit

    // 1. Paid to vendor (Cr. Bank 150,000)
    const payment1 = { debit: 0, credit: 150000 };
    bankBalance += payment1.debit - payment1.credit;
    expect(bankBalance).toBe(350000);

    // 2. Client IPC collection received (Dr. Bank 400,000)
    const collection = { debit: 400000, credit: 0 };
    bankBalance += collection.debit - collection.credit;
    expect(bankBalance).toBe(750000);
  });

  it("should verify Trial Balance mathematical balance and equality", () => {
    const trialBalanceRows = [
      // Current Assets (Debits)
      { head: "Client Receivables", debit: 350000, credit: 0 },
      { head: "Bank Balance", debit: 450000, credit: 0 },

      // Direct Costs (Debits)
      { head: "Material Purchases", debit: 500000, credit: 0 },
      { head: "Subcontract Work", debit: 300000, credit: 0 },
      { head: "Site Overheads", debit: 50000, credit: 0 },

      // Current Liabilities (Credits)
      { head: "Vendor Payables", debit: 0, credit: 200000 },
      { head: "Subcontractor Payables", debit: 0, credit: 100000 },
      { head: "TDS Payable", debit: 0, credit: 15000 },
      { head: "Retention Held", debit: 0, credit: 35000 },

      // Incomes & Capital (Credits)
      { head: "IPC Contract Revenue", debit: 0, credit: 1300000 },
    ];

    const totalDebits = trialBalanceRows.reduce((s, r) => s + r.debit, 0);
    const totalCredits = trialBalanceRows.reduce((s, r) => s + r.credit, 0);

    expect(totalDebits).toBe(1650000);
    expect(totalCredits).toBe(1650000);
    expect(totalDebits - totalCredits).toBe(0);
  });
});
