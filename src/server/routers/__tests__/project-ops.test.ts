/**
 * Router-layer tests for project-ops.ts (payment, safety, quality, meeting).
 *
 * Pins:
 *   - payment.create: amount consistency (amount = tds + netPaid) with
 *     explicit-zero netPaid preserved; overpayment rejected BEFORE any
 *     write; linked-bill settlement debits the payable (2001/2002) and
 *     flips partially_paid/paid; unlinked payments debit the category
 *     expense account (NEVER a payable); cash → 1001, else → 1010; TDS
 *     line (2020) only when TDS > 0; org-scoped bank account guard +
 *     atomic balance decrement
 *   - payment.delete: JE reversal in the same transaction; cross-project
 *     payment NOT_FOUND (IDOR fix)
 *   - payment.bulkCreate: all-or-nothing single transaction
 *   - releaseRetention: over-release rejected; JE Dr 2010 / Cr 2002;
 *     released total updated on the subcontractor
 *   - retentionSummary: held = IPC+bill retention − released payments
 *   - safety/quality/meeting delete: REGRESSION for cross-project IDOR —
 *     the row must be verified against input.projectId BEFORE deletion
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { projectOpsRouter } from "../project-ops";

const anyDb = db as any;
const USER = buildUser();
const PM = buildUser({ id: "pm-1" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

const basePayment = {
  projectId: "p-1",
  payeeType: "vendor" as const,
  payeeName: "Everest Suppliers",
  amount: 100,
  tdsDeducted: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── payment.create ─────────────────────────────────────────────────────────
describe("payment.create — validation", () => {
  it("rejects an inconsistent amount/netPaid combo", async () => {
    member("engineer");
    const caller = createCaller(projectOpsRouter, USER);
    await expectTRPCError(
      caller.payment.create({ ...basePayment, tdsDeducted: 20, netPaid: 90 }),
      "BAD_REQUEST",
    );
    expect(anyDb.payment.create).not.toHaveBeenCalled();
  });

  it("computes netPaid = amount − tds when not supplied", async () => {
    member("engineer");
    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.create({ ...basePayment, tdsDeducted: 20 });
    expect(anyDb.payment.create.mock.calls[0][0].data.netPaid).toBe(80);
  });

  it("preserves an explicit netPaid of 0 (full TDS deduction)", async () => {
    member("engineer");
    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.create({ ...basePayment, tdsDeducted: 100, netPaid: 0 });
    expect(anyDb.payment.create.mock.calls[0][0].data.netPaid).toBe(0);
  });

  it("rejects overpayment against a linked vendor bill BEFORE any write", async () => {
    member("engineer");
    anyDb.vendorBill.findFirst.mockResolvedValue({
      id: "vb-1",
      billNumber: "INV-1",
      paidAmount: 90,
      netPayable: 100,
    });
    const caller = createCaller(projectOpsRouter, USER);
    await expectTRPCError(
      caller.payment.create({ ...basePayment, amount: 30, invoiceNumber: "INV-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.payment.create).not.toHaveBeenCalled();
    expect(anyDb.vendorBill.update).not.toHaveBeenCalled();
  });
});

describe("payment.create — journal entry routing", () => {
  it("settling a vendor bill debits Sundry Creditors and flips partially_paid", async () => {
    member("engineer");
    anyDb.vendorBill.findFirst.mockResolvedValue({
      id: "vb-1",
      billNumber: "INV-1",
      paidAmount: 40,
      netPayable: 100,
    });
    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.create({ ...basePayment, amount: 30, invoiceNumber: "INV-1" });

    const jeArgs = anyDb.journalEntry.create.mock.calls[0][0];
    const debitLine = jeArgs.data.lines.create[0];
    expect(debitLine.accountCode).toBe("2001");
    expect(debitLine.debit).toBe(30);

    expect(anyDb.vendorBill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { paidAmount: 70, status: "partially_paid" },
      }),
    );
    expect(anyDb.vendorPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vendorBillId: "vb-1", amount: 30 }),
      }),
    );
  });

  it("full settlement flips the bill to paid", async () => {
    member("engineer");
    anyDb.vendorBill.findFirst.mockResolvedValue({
      id: "vb-1",
      billNumber: "INV-1",
      paidAmount: 70,
      netPayable: 100,
    });
    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.create({ ...basePayment, amount: 30, invoiceNumber: "INV-1" });
    expect(anyDb.vendorBill.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paidAmount: 100, status: "paid" } }),
    );
  });

  it("unlinked payments debit the category expense account, never a payable", async () => {
    member("engineer");
    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.create({ ...basePayment, category: "fuel" });

    const jeArgs = anyDb.journalEntry.create.mock.calls[0][0];
    const debitLine = jeArgs.data.lines.create[0];
    expect(debitLine.accountCode).toBe("6003"); // Site Overhead - Fuel
    expect(debitLine.accountCode).not.toBe("2001");
    expect(debitLine.accountCode).not.toBe("2002");
  });

  it("cash payments credit 1001, bank payments credit 1010", async () => {
    member("engineer");
    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.create({ ...basePayment, paymentMode: "cash" });
    let lines = anyDb.journalEntry.create.mock.calls[0][0].data.lines.create;
    expect(lines[lines.length - 1].accountCode).toBe("1001");

    await caller.payment.create({ ...basePayment, paymentMode: "cheque" });
    lines = anyDb.journalEntry.create.mock.calls[1][0].data.lines.create;
    expect(lines[lines.length - 1].accountCode).toBe("1010");
  });

  it("adds the TDS payable line only when TDS > 0", async () => {
    member("engineer");
    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.create({ ...basePayment, tdsDeducted: 15 });
    let lines = anyDb.journalEntry.create.mock.calls[0][0].data.lines.create;
    expect(lines).toHaveLength(3);
    expect(lines[1].accountCode).toBe("2020");
    expect(lines[1].credit).toBe(15);

    await caller.payment.create({ ...basePayment, tdsDeducted: 0 });
    lines = anyDb.journalEntry.create.mock.calls[1][0].data.lines.create;
    expect(lines).toHaveLength(2);
  });

  it("FORBIDDENs a bank account outside the caller's org", async () => {
    member("engineer");
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-2",
      organizationId: "org-2",
      currentBalance: 99999,
    });
    const caller = createCaller(projectOpsRouter, USER);
    await expectTRPCError(
      caller.payment.create({ ...basePayment, companyBankAccountId: "bank-2" }),
      "FORBIDDEN",
    );
    expect(anyDb.payment.create).not.toHaveBeenCalled();
  });

  it("decrements the org bank balance in the same transaction", async () => {
    member("engineer");
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
      currentBalance: 50000,
    });
    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.create({ ...basePayment, companyBankAccountId: "bank-1" });
    expect(anyDb.$executeRaw).toHaveBeenCalled();
  });
});

// ─── payment.delete ─────────────────────────────────────────────────────────
describe("payment.delete", () => {
  it("reverses linked journal entries atomically and deletes the payment", async () => {
    member("engineer");
    anyDb.payment.findFirst.mockResolvedValue({
      id: "pay-1",
      projectId: "p-1",
      paymentDate: new Date("2026-08-01"),
      amount: 1000,
      payeeName: "X",
      companyBankAccountId: null,
      netPaid: 900,
    });
    anyDb.journalEntry.findMany.mockResolvedValue([{ id: "je-1" }]);
    anyDb.journalEntry.findFirst.mockResolvedValue(null); // not yet reversed
    anyDb.journalEntry.findUnique.mockResolvedValue({
      id: "je-1",
      lines: [
        { accountCode: "1010", accountName: "Bank", debit: 0, credit: 900, description: "net", projectId: "p-1" },
      ],
    });

    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.delete({ id: "pay-1", projectId: "p-1" });

    // A reversal entry was posted (source "reversal", swapped lines)
    expect(anyDb.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "reversal" }),
      }),
    );
    expect(anyDb.payment.delete).toHaveBeenCalledWith({ where: { id: "pay-1" } });
  });

  it("NOT_FOUNDs a payment that belongs to another project (IDOR fix)", async () => {
    member("engineer");
    anyDb.payment.findFirst.mockResolvedValue(null);
    const caller = createCaller(projectOpsRouter, USER);
    await expectTRPCError(
      caller.payment.delete({ id: "foreign", projectId: "p-1" }),
      "NOT_FOUND",
    );
    expect(anyDb.payment.delete).not.toHaveBeenCalled();
  });
});

// ─── payment.bulkCreate ─────────────────────────────────────────────────────
describe("payment.bulkCreate", () => {
  it("creates every payment + JE inside ONE transaction", async () => {
    member("engineer");
    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.bulkCreate({
      projectId: "p-1",
      payments: [
        { payeeName: "A", amount: 100, tdsDeducted: 10 },
        { payeeName: "B", amount: 200, tdsDeducted: 0 },
      ],
    });
    expect(anyDb.$transaction).toHaveBeenCalledTimes(1);
    expect(anyDb.payment.create).toHaveBeenCalledTimes(2);
    expect(anyDb.payment.create.mock.calls[0][0].data.netPaid).toBe(90);
    expect(anyDb.payment.create.mock.calls[1][0].data.netPaid).toBe(200);
    expect(anyDb.journalEntry.create).toHaveBeenCalledTimes(2);
  });
});

// ─── releaseRetention ───────────────────────────────────────────────────────
describe("payment.releaseRetention", () => {
  const releaseInput = {
    projectId: "p-1",
    subcontractorId: "sub-1",
    amount: 3000,
  };

  function sub(held = 5000, released = 1000) {
    anyDb.subcontractor.findFirst.mockResolvedValue({
      id: "sub-1",
      name: "Sub A",
      totalRetentionHeld: held,
      totalRetentionReleased: released,
    });
  }

  it("rejects releasing more retention than is held", async () => {
    member("engineer");
    sub();
    const caller = createCaller(projectOpsRouter, USER);
    await expectTRPCError(
      caller.payment.releaseRetention({ ...releaseInput, amount: 5000 }),
      "BAD_REQUEST",
    );
    expect(anyDb.payment.create).not.toHaveBeenCalled();
  });

  it("posts Dr 2010 / Cr 2002 and updates the released total", async () => {
    member("engineer");
    sub();
    const caller = createCaller(projectOpsRouter, USER);
    await caller.payment.releaseRetention(releaseInput);

    expect(anyDb.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 3000,
          netPaid: 3000,
          retentionReleased: 3000,
          status: "paid",
        }),
      }),
    );
    const lines = anyDb.journalEntry.create.mock.calls[0][0].data.lines.create;
    expect(lines[0].accountCode).toBe("2010");
    expect(lines[0].debit).toBe(3000);
    expect(lines[1].accountCode).toBe("2002");
    expect(lines[1].credit).toBe(3000);

    expect(anyDb.subcontractor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { totalRetentionReleased: 4000 },
      }),
    );
  });

  it("NOT_FOUNDs a subcontractor from another project", async () => {
    member("engineer");
    anyDb.subcontractor.findFirst.mockResolvedValue(null);
    const caller = createCaller(projectOpsRouter, USER);
    await expectTRPCError(caller.payment.releaseRetention(releaseInput), "NOT_FOUND");
  });
});

// ─── retentionSummary ───────────────────────────────────────────────────────
describe("payment.retentionSummary", () => {
  it("aggregates held retention across IPCs and sub bills minus releases", async () => {
    member("engineer");
    anyDb.subcontractor.findMany.mockResolvedValue([
      { id: "sub-1", name: "Sub A", contractValue: 100000, totalRetentionHeld: 0, totalRetentionReleased: 0 },
    ]);
    anyDb.ipc.findMany.mockResolvedValue([
      { subcontractorId: "sub-1", retentionAmount: 5000, status: "certified" },
    ]);
    anyDb.subcontractorBill.findMany.mockResolvedValue([
      { subcontractorId: "sub-1", retentionAmount: 2000 },
    ]);
    anyDb.payment.findMany.mockResolvedValue([
      { payeeId: "sub-1", retentionReleased: 3000, paymentDate: new Date() },
    ]);

    const caller = createCaller(projectOpsRouter, USER);
    const res = await caller.payment.retentionSummary({ projectId: "p-1" });
    expect(res.rows[0].ipcRetention).toBe(7000);
    expect(res.rows[0].released).toBe(3000);
    expect(res.rows[0].held).toBe(4000);
    expect(res.totals.totalHeld).toBe(4000);
  });
});

// ─── safety / quality / meeting IDOR regression ────────────────────────────
describe("cross-project delete guards (IDOR regression)", () => {
  /**
   * safety.delete / quality.delete / meeting.delete authorize on
   * input.projectId but previously deleted by bare { id } without ever
   * verifying the row belongs to that project — a writer on project A
   * could delete rows in any other project (or org). The row must be
   * fetched with { id, projectId } and NOT_FOUND returned otherwise.
   */
  const cases = [
    {
      name: "safety.delete",
      model: "safetyIncident",
      call: (caller: any) => caller.safety.delete({ id: "x-1", projectId: "p-1" }),
    },
    {
      name: "quality.delete",
      model: "qualityInspection",
      call: (caller: any) => caller.quality.delete({ id: "x-1", projectId: "p-1" }),
    },
    {
      name: "meeting.delete",
      model: "meeting",
      call: (caller: any) => caller.meeting.delete({ id: "x-1", projectId: "p-1" }),
    },
  ];

  for (const c of cases) {
    it(`${c.name}: NOT_FOUND (no delete) when the row belongs to another project`, async () => {
      member("project_manager");
      anyDb[c.model].findFirst.mockResolvedValue(null); // row not in this project
      const caller = createCaller(projectOpsRouter, PM);
      await expectTRPCError(c.call(caller), "NOT_FOUND");
      expect(anyDb[c.model].delete).not.toHaveBeenCalled();
    });

    it(`${c.name}: deletes when the row is verified in this project`, async () => {
      member("project_manager");
      anyDb[c.model].findFirst.mockResolvedValue({ id: "x-1", projectId: "p-1" });
      const caller = createCaller(projectOpsRouter, PM);
      await c.call(caller);
      expect(anyDb[c.model].delete).toHaveBeenCalledWith({ where: { id: "x-1" } });
    });
  }
});

// ─── safety.updateStatus / quality.complete: row-scoped authz ──────────────
describe("row-scoped authorization on status updates", () => {
  it("safety.updateStatus resolves membership from the ROW's project", async () => {
    anyDb.safetyIncident.findUnique.mockResolvedValue({ projectId: "p-2" });
    member(null); // not a member of p-2
    const caller = createCaller(projectOpsRouter, USER);
    await expectTRPCError(
      caller.safety.updateStatus({ id: "si-1", status: "resolved" }),
      "FORBIDDEN",
    );
    expect(anyDb.safetyIncident.update).not.toHaveBeenCalled();
  });

  it("quality.complete maps a failed result to ncr_raised", async () => {
    anyDb.qualityInspection.findUnique.mockResolvedValue({ projectId: "p-1" });
    member("engineer");
    const caller = createCaller(projectOpsRouter, USER);
    await caller.quality.complete({ id: "qi-1", result: "fail" });
    expect(anyDb.qualityInspection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ncr_raised", result: "fail" }),
      }),
    );
  });
});
