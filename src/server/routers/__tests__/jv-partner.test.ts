/**
 * Router-layer tests for jv-partner.ts (single-firm managed JV commissions).
 *
 * Pins:
 *   - getAgreement: commission accrues ONLY on client IPCs (subcontractor
 *     IPCs excluded) with certified/approved/paid status; rate defaults to
 *     1.5% with no agreement; balanceDue = accrued − paid; per-IPC breakdown
 *     marks IPCs already covered by a payout
 *   - saveAgreement/deletePayout: manager-only (project_manager role)
 *   - recordPayout (financialProcedure pipeline):
 *       · no agreement → NOT_FOUND
 *       · TDS math (default 1.5%) and net = gross − TDS
 *       · bank account decremented by the NET amount
 *       · delegation: under hq_centralized_imprest an engineer is FORBIDDEN
 *         from JV payouts, a coordinator passes
 *       · fiscal lock on the payout date blocks the disbursement
 *       · NEW GUARD: payout exceeding the outstanding commission balance
 *         is rejected (no paying unearned commission out of the org bank)
 *       · NEW GUARD: one payout per certified IPC (no double payment)
 *       · voucher number sequenced per agreement (JV-COMM-001)
 *   - deletePayout: restores the bank balance by the NET amount after
 *     verifying org ownership of the bank account
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { db } from "@/lib/db";
import { jvPartnerRouter } from "../jv-partner";

const anyDb = db as any;
const USER = buildUser();
const PM = buildUser({ id: "pm-1" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function agreement(overrides: Record<string, unknown> = {}) {
  return {
    id: "agr-1",
    projectId: "p-1",
    partnerName: "Everest JV Partners",
    commissionRate: 2,
    payouts: [],
    ...overrides,
  };
}

function clientIpcs() {
  return [
    { id: "ipc-1", number: "IPC-001", period: "2083-01", grossAmount: 600000, status: "certified", issueDate: new Date() },
    { id: "ipc-2", number: "IPC-002", period: "2083-02", grossAmount: 400000, status: "approved", issueDate: new Date() },
    { id: "ipc-3", number: "IPC-003", period: "2083-03", grossAmount: 500000, status: "draft", issueDate: new Date() }, // not certified
    { id: "ipc-4", number: "IPC-004", period: "2083-04", grossAmount: 700000, status: "paid", issueDate: new Date(), subcontractorId: "sub-1" }, // subcontractor IPC
  ];
}

/** Rows Prisma would return for the where clause (certified client IPCs). */
function certifiedClientIpcs() {
  return clientIpcs().filter(
    (i) => !("subcontractorId" in i) && i.status !== "draft",
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── getAgreement ───────────────────────────────────────────────────────────
describe("jvPartner.getAgreement", () => {
  it("requires project membership", async () => {
    member(null);
    const caller = createCaller(jvPartnerRouter, USER);
    await expectTRPCError(caller.getAgreement({ projectId: "p-1" }), "FORBIDDEN");
  });

  it("defaults to 1.5% commission with zero sums when no agreement exists", async () => {
    member("engineer");
    anyDb.jvPartnerAgreement.findUnique.mockResolvedValue(null);
    anyDb.ipc.findMany.mockResolvedValue([]);

    const caller = createCaller(jvPartnerRouter, USER);
    const res = await caller.getAgreement({ projectId: "p-1" });

    expect(res.agreement).toBeNull();
    expect(res.summary.commissionRate).toBe(1.5);
    expect(res.summary.totalCommissionAccrued).toBe(0);
    expect(res.summary.balanceDue).toBe(0);
  });

  it("accrues only on certified client IPCs and nets out payouts", async () => {
    member("engineer");
    anyDb.jvPartnerAgreement.findUnique.mockResolvedValue(
      agreement({
        commissionRate: 2,
        payouts: [
          { grossAmount: 5000, tdsAmount: 75, netAmount: 4925, ipcId: "ipc-1" },
        ],
      }),
    );
    anyDb.ipc.findMany.mockResolvedValue(certifiedClientIpcs());

    const caller = createCaller(jvPartnerRouter, USER);
    const res = await caller.getAgreement({ projectId: "p-1" });

    // The where clause must exclude draft + subcontractor IPCs at the DB level
    expect(anyDb.ipc.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      subcontractorId: null,
      status: { in: ["certified", "approved", "paid"] },
    });

    // Only ipc-1 (600k) + ipc-2 (400k) count → 1,000,000 × 2% = 20,000
    expect(res.summary.totalCertifiedTurnover).toBe(1000000);
    expect(res.summary.totalCommissionAccrued).toBe(20000);
    expect(res.summary.totalCommissionPaid).toBe(5000);
    expect(res.summary.totalTdsDeducted).toBe(75);
    expect(res.summary.totalNetDisbursed).toBe(4925);
    expect(res.summary.balanceDue).toBe(15000);

    // Breakdown: ipc-1 paid, ipc-2 unpaid, ipc-3/4 absent
    const ids = res.ipcBreakdown.map((b: any) => b.ipcId);
    expect(ids).toEqual(["ipc-1", "ipc-2"]);
    expect(res.ipcBreakdown[0].isPaid).toBe(true);
    expect(res.ipcBreakdown[0].accruedCommission).toBe(12000);
    expect(res.ipcBreakdown[1].isPaid).toBe(false);
  });
});

// ─── saveAgreement ──────────────────────────────────────────────────────────
describe("jvPartner.saveAgreement", () => {
  const input = {
    projectId: "p-1",
    partnerName: "  Everest JV  ",
    commissionRate: 1.75,
  };

  it("requires the Project Manager role", async () => {
    member("coordinator");
    const caller = createCaller(jvPartnerRouter, USER);
    await expectTRPCError(caller.saveAgreement(input), "FORBIDDEN");
  });

  it("upserts with trimmed partner name and the agreed rate", async () => {
    member("project_manager");
    anyDb.jvPartnerAgreement.upsert.mockResolvedValue(agreement());
    const caller = createCaller(jvPartnerRouter, PM);
    await caller.saveAgreement(input);

    const arg = anyDb.jvPartnerAgreement.upsert.mock.calls[0][0];
    expect(arg.create.partnerName).toBe("Everest JV");
    expect(arg.create.commissionRate).toBe(1.75);
    expect(arg.update.partnerName).toBe("Everest JV");
  });
});

// ─── recordPayout ───────────────────────────────────────────────────────────
describe("jvPartner.recordPayout", () => {
  function payoutInput(overrides: Record<string, unknown> = {}) {
    return {
      projectId: "p-1",
      grossAmount: 10000,
      bankAccountId: "bank-1",
      payoutDate: "2026-08-20",
      ...overrides,
    };
  }

  function setupHappyPath() {
    member("coordinator"); // allowed under every operating model
    anyDb.jvPartnerAgreement.findUnique.mockResolvedValue(agreement({ commissionRate: 2 }));
    anyDb.ipc.findMany.mockResolvedValue(certifiedClientIpcs()); // accrued = 20,000
    anyDb.jvCommissionPayout.findMany.mockResolvedValue([]);
    anyDb.jvCommissionPayout.count.mockResolvedValue(0);
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
      currentBalance: 500000,
    });
  }

  it("no agreement configured → NOT_FOUND", async () => {
    member("coordinator");
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
      currentBalance: 500000,
    });
    anyDb.jvPartnerAgreement.findUnique.mockResolvedValue(null);
    const caller = createCaller(jvPartnerRouter, USER);
    await expectTRPCError(caller.recordPayout(payoutInput()), "NOT_FOUND");
  });

  it("computes TDS and net, decrements the bank by NET, and sequences the voucher", async () => {
    setupHappyPath();
    const caller = createCaller(jvPartnerRouter, USER);
    await caller.recordPayout(payoutInput());

    const data = anyDb.jvCommissionPayout.create.mock.calls[0][0].data;
    expect(data.voucherNo).toBe("JV-COMM-001");
    expect(data.tdsAmount).toBe(150); // 1.5% default TDS
    expect(data.netAmount).toBe(9850);
    // P2 item 30: the decrement is a guarded atomic raw UPDATE now.
    const dec = anyDb.$executeRaw.mock.calls.find((c: any[]) => c[0].join("?").includes('UPDATE "CompanyBankAccount"'));
    expect(dec).toBeDefined();
    expect(dec.slice(1)).toContain("bank-1");
    expect(dec.slice(1)).toContain(9850);
  });

  it("REJECTS payouts exceeding the outstanding commission balance", async () => {
    setupHappyPath();
    const caller = createCaller(jvPartnerRouter, USER);
    // Accrued 20,000 → asking for 25,000 must fail
    await expectTRPCError(
      caller.recordPayout(payoutInput({ grossAmount: 25000 })),
      "BAD_REQUEST",
    );
    expect(anyDb.jvCommissionPayout.create).not.toHaveBeenCalled();
    expect(anyDb.companyBankAccount.update).not.toHaveBeenCalled();
  });

  it("REJECTS a second payout against the same certified IPC", async () => {
    setupHappyPath();
    anyDb.jvCommissionPayout.findMany.mockResolvedValue([
      { grossAmount: 5000, ipcId: "ipc-1" },
    ]);
    const caller = createCaller(jvPartnerRouter, USER);
    await expectTRPCError(
      caller.recordPayout(payoutInput({ ipcId: "ipc-1", grossAmount: 5000 })),
      "BAD_REQUEST",
    );
    expect(anyDb.jvCommissionPayout.create).not.toHaveBeenCalled();
  });

  it("allows a payout within the remaining balance after prior payments", async () => {
    setupHappyPath();
    anyDb.jvCommissionPayout.findMany.mockResolvedValue([
      { grossAmount: 12000, ipcId: "ipc-1" }, // balance 20,000 − 12,000 = 8,000
    ]);
    const caller = createCaller(jvPartnerRouter, USER);
    await caller.recordPayout(payoutInput({ grossAmount: 8000, ipcId: "ipc-2" }));
    expect(anyDb.jvCommissionPayout.create).toHaveBeenCalled();
  });

  it("engineers are FORBIDDEN under the centralized operating model", async () => {
    member("engineer");
    anyDb.organization.findUnique.mockResolvedValue({
      operatingModel: "hq_centralized_imprest",
      sitePettyCashLimit: 25000,
    });
    anyDb.delegationRule.findMany.mockResolvedValue([]);
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
      currentBalance: 500000,
    });
    anyDb.jvPartnerAgreement.findUnique.mockResolvedValue(agreement());

    const caller = createCaller(jvPartnerRouter, USER);
    await expectTRPCError(caller.recordPayout(payoutInput()), "FORBIDDEN");
  });

  it("fiscal lock on the payout date blocks the disbursement", async () => {
    member("coordinator");
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
      currentBalance: 500000,
    });
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2081/82" });
    const caller = createCaller(jvPartnerRouter, USER);
    await expectTRPCError(caller.recordPayout(payoutInput()), "FORBIDDEN");
    expect(anyDb.jvCommissionPayout.create).not.toHaveBeenCalled();
  });

  it("a bank account from another org is rejected by the isolation choke point", async () => {
    member("coordinator");
    anyDb.jvPartnerAgreement.findUnique.mockResolvedValue(agreement());
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-x",
      organizationId: "org-2", // foreign org
      currentBalance: 1,
    });
    const caller = createCaller(jvPartnerRouter, USER);
    await expectTRPCError(caller.recordPayout(payoutInput()), "FORBIDDEN");
  });
});

// ─── deletePayout ───────────────────────────────────────────────────────────
describe("jvPartner.deletePayout", () => {
  it("unknown payout for the project → NOT_FOUND", async () => {
    member("project_manager");
    anyDb.jvCommissionPayout.findFirst.mockResolvedValue(null);
    const caller = createCaller(jvPartnerRouter, PM);
    await expectTRPCError(
      caller.deletePayout({ projectId: "p-1", payoutId: "px" }),
      "NOT_FOUND",
    );
  });

  it("requires the Project Manager role", async () => {
    member("engineer");
    const caller = createCaller(jvPartnerRouter, USER);
    await expectTRPCError(
      caller.deletePayout({ projectId: "p-1", payoutId: "po-1" }),
      "FORBIDDEN",
    );
  });

  it("deletes the payout and restores the bank balance by the NET amount", async () => {
    member("project_manager");
    anyDb.jvCommissionPayout.findFirst.mockResolvedValue({
      id: "po-1",
      agreementId: "agr-1",
      bankAccountId: "bank-1",
      netAmount: 9850,
      voucherNo: "JV-COMM-001",
    });
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-1",
      organizationId: "org-1",
      currentBalance: 100000,
    });

    const caller = createCaller(jvPartnerRouter, PM);
    const res = await caller.deletePayout({ projectId: "p-1", payoutId: "po-1" });

    expect(res.success).toBe(true);
    expect(anyDb.companyBankAccount.update).toHaveBeenCalledWith({
      where: { id: "bank-1" },
      data: { currentBalance: { increment: 9850 } },
    });
    expect(anyDb.jvCommissionPayout.delete).toHaveBeenCalledWith({
      where: { id: "po-1" },
    });
  });

  it("a payout wired to a foreign org's bank is deleted WITHOUT touching that bank", async () => {
    member("project_manager");
    anyDb.jvCommissionPayout.findFirst.mockResolvedValue({
      id: "po-1",
      agreementId: "agr-1",
      bankAccountId: "bank-x",
      netAmount: 9850,
      voucherNo: "JV-COMM-002",
    });
    anyDb.companyBankAccount.findUnique.mockResolvedValue({
      id: "bank-x",
      organizationId: "org-2", // not ours — must not be restored
      currentBalance: 1,
    });

    const caller = createCaller(jvPartnerRouter, PM);
    const res = await caller.deletePayout({ projectId: "p-1", payoutId: "po-1" });
    expect(res.success).toBe(true);
    expect(anyDb.companyBankAccount.update).not.toHaveBeenCalled();
  });
});
