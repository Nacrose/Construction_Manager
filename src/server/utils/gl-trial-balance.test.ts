import { describe, it, expect } from "vitest";
import { aggregateTrialBalance, type GlLine } from "@/server/utils/gl-trial-balance";
import { CHART_OF_ACCOUNTS } from "@/lib/chart-of-accounts";

describe("GL Trial Balance Aggregation", () => {
  it("ties out exactly for a balanced GL (the old ad-hoc TB never could)", () => {
    // A vendor bill (Dr 5001 + Dr 1410 / Cr 2020 + Cr 2001) paid later
    // (Dr 2001 / Cr 1010) plus a client receipt (Dr 1010 / Cr 1100).
    const lines: GlLine[] = [
      { accountCode: "5001", accountName: "Material / Purchases", debit: 100000, credit: 0 },
      { accountCode: "1410", accountName: "Input VAT Receivable", debit: 13000, credit: 0 },
      { accountCode: "2020", accountName: "TDS Payable", debit: 0, credit: 1500 },
      { accountCode: "2001", accountName: "Sundry Creditors", debit: 0, credit: 111500 },
      // payment settles the creditor
      { accountCode: "2001", accountName: "Sundry Creditors", debit: 111500, credit: 0 },
      { accountCode: "1010", accountName: "Bank", debit: 0, credit: 111500 },
      // client receipt against IPC
      { accountCode: "1010", accountName: "Bank", debit: 200000, credit: 0 },
      { accountCode: "1100", accountName: "Client Receivables", debit: 0, credit: 200000 },
    ];

    const result = aggregateTrialBalance(lines);
    expect(result.isBalanced).toBe(true);
    expect(result.difference).toBe(0);
    expect(result.totalDebits).toBe(result.totalCredits);

    // Nets per account (row heads use the canonical chart-of-accounts
    // names, which the aggregator prefers over denormalized line names):
    const byHead = new Map(result.rows.map((r) => [r.head, r]));
    expect(byHead.get("Material Consumption")?.debit).toBe(100000);
    expect(byHead.get("Input VAT Receivable (from IRD)")?.debit).toBe(13000);
    expect(byHead.get("TDS Payable (to IRD)")?.credit).toBe(1500);
    // Creditor: 111500 credit − 111500 debit = fully settled → no row
    expect([...byHead.keys()].some((h) => h.includes("Creditors"))).toBe(false);
    // Bank: 200000 in − 111500 out = 88500 debit
    expect(byHead.get("Bank - Current Account")?.debit).toBe(88500);
    expect(byHead.get("Client Receivables (IPC Due)")?.credit).toBe(200000);
  });

  it("nets debit-heavy accounts to the debit column and credit-heavy to credit", () => {
    const lines: GlLine[] = [
      { accountCode: "1010", accountName: "Bank", debit: 100, credit: 40 },
      { accountCode: "2001", accountName: "Sundry Creditors", debit: 10, credit: 70 },
    ];
    const result = aggregateTrialBalance(lines);
    const bank = result.rows.find((r) => r.head.includes("Bank"))!;
    expect(bank.debit).toBe(60);
    expect(bank.credit).toBe(0);
    const creditors = result.rows.find((r) => r.head.includes("Creditors"))!;
    expect(creditors.credit).toBe(60);
    expect(creditors.debit).toBe(0);
  });

  it("skips accounts with no activity and accounts netting to zero", () => {
    const lines: GlLine[] = [
      { accountCode: "5001", accountName: "Material", debit: 0, credit: 0 },
      { accountCode: "1010", accountName: "Bank", debit: 5, credit: 5 },
      { accountCode: "2001", accountName: "Creditors", debit: 0, credit: 0 },
    ];
    const result = aggregateTrialBalance(lines);
    expect(result.rows).toHaveLength(0);
    expect(result.isBalanced).toBe(true);
  });

  it("flags GL corruption (unbalanced lines written outside the engine)", () => {
    const lines: GlLine[] = [
      { accountCode: "5001", accountName: "Material", debit: 1000, credit: 0 },
      { accountCode: "1010", accountName: "Bank", debit: 0, credit: 900 }, // 100 short
    ];
    const result = aggregateTrialBalance(lines);
    expect(result.isBalanced).toBe(false);
    expect(result.difference).toBeCloseTo(100, 10);
  });

  it("classifies unknown account codes as Unclassified (surfaces chart gaps)", () => {
    const lines: GlLine[] = [
      { accountCode: "9999", accountName: "Mystery Account", debit: 100, credit: 0 },
      { accountCode: "1010", accountName: "Bank", debit: 0, credit: 100 },
    ];
    const result = aggregateTrialBalance(lines);
    const mystery = result.rows.find((r) => r.head === "Mystery Account")!;
    expect(mystery.group).toBe("Unclassified");
  });

  it("prefers the chart-of-accounts name over the denormalized line name", () => {
    const lines: GlLine[] = [
      { accountCode: "1010", accountName: "Some Old Label", debit: 50, credit: 0 },
      { accountCode: "1001", accountName: "Cash", debit: 0, credit: 50 },
    ];
    const result = aggregateTrialBalance(lines);
    const bankRow = result.rows.find((r) => r.head === "Bank - Current Account");
    expect(bankRow).toBeDefined();
    expect(bankRow?.group).toBe("Current Assets");
  });
});

describe("Chart of Accounts integrity (collision regression guard)", () => {
  it("has no duplicate account codes", () => {
    const codes = CHART_OF_ACCOUNTS.map((a) => a.code);
    const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
    expect(dupes).toEqual([]);
  });

  it("has dedicated accounts for the previously-colliding codes", () => {
    const byCode = new Map(CHART_OF_ACCOUNTS.map((a) => [a.code, a]));
    // 1400 = TDS Receivable (asset); 1410 = Input VAT (asset) — no longer shared
    expect(byCode.get("1400")?.category).toBe("asset");
    expect(byCode.get("1400")?.name).toMatch(/TDS/);
    expect(byCode.get("1410")?.category).toBe("asset");
    expect(byCode.get("1410")?.name).toMatch(/Input VAT/);
    // 2003 exists (was posted to but missing from the chart)
    expect(byCode.get("2003")?.category).toBe("liability");
    expect(byCode.get("2003")?.name).toMatch(/Material Deductions/);
    // 2040 is an ASSET (recoverable), not a liability
    expect(byCode.get("2040")?.category).toBe("asset");
    expect(byCode.get("2040")?.name).toMatch(/Staff Advances/);
    // 1130 exists for subcontractor advance recovery
    expect(byCode.get("1130")?.name).toMatch(/Advance to Subcontractors/);
  });
});
