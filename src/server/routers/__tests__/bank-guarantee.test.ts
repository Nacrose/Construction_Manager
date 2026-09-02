/**
 * Router-layer tests for bank-guarantee.ts (बैंक ग्यारेन्टी).
 *
 * Pins:
 *   - list: org-scoped where clause; KPI math — active exposure/margin from
 *     non-expired active+extended rows only, commission across all rows,
 *     expiring ≤30d count; auto-expire write-through for lapsed guarantees
 *   - portfolioAlerts: scoped to the user's memberships + org, alerts for
 *     guarantees expiring within 45 days
 *   - create: project guarantees need the Project Manager; org-level need
 *     org-admin; expiry < issued rejected; miti auto-derived from the AD
 *     date (real BS calendar); claimExpiryDate = expiry + claimPeriodDays;
 *     fiscal lock on the issue date; documentUrl passes the XSS allowlist
 *     (javascript: URIs rejected)
 *   - extend: strictly-after rule, amendment history appended, commission
 *     accumulated, claim expiry recomputed
 *   - release: status flip + reference appended to notes
 *   - update: org-level cross-tenant FORBIDDEN; negative amount rejected
 *     (zod) — guarantees can't be silently flipped negative
 *   - delete: same access discipline
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";
import { toMoney } from "@/lib/money";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { db } from "@/lib/db";
import { bankGuaranteeRouter } from "../bank-guarantee";

const anyDb = db as any;
const DAY = 24 * 60 * 60 * 1000;
const ENGINEER = buildUser();
const PM = buildUser({ id: "pm-1" });
const ORG_ADMIN = buildUser({ id: "oa-1", orgRole: "org_admin" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── list ───────────────────────────────────────────────────────────────────
describe("bankGuarantee.list", () => {
  it("project-scoped list requires membership", async () => {
    member(null);
    const caller = createCaller(bankGuaranteeRouter, ENGINEER);
    await expectTRPCError(caller.list({ projectId: "p-1" }), "FORBIDDEN");
  });

  it("user with no org and no project gets an empty KPI payload, not a leak", async () => {
    const loner = buildUser({ organizationId: null });
    const caller = createCaller(bankGuaranteeRouter, loner);
    const res = await caller.list({});
    expect(res.items).toEqual([]);
    expect(res.kpis.totalCount).toBe(0);
    expect(anyDb.bankGuarantee.findMany).not.toHaveBeenCalled();
  });

  it("computes KPIs, auto-expires lapsed guarantees, and scopes by org", async () => {
    const now = Date.now();
    anyDb.bankGuarantee.findMany.mockResolvedValue([
      { id: "g1", amount: 100000, marginAmount: 10000, commissionPaid: 2000, status: "active", expiryDate: new Date(now + 10 * DAY) },
      { id: "g2", amount: 50000, marginAmount: 5000, commissionPaid: 1000, status: "active", expiryDate: new Date(now - 5 * DAY) },
      { id: "g3", amount: 20000, marginAmount: 2000, commissionPaid: 500, status: "released", expiryDate: new Date(now + 60 * DAY) },
    ]);
    const caller = createCaller(bankGuaranteeRouter, ENGINEER);
    const res = await caller.list({});

    // where scoped to the caller's org (direct or via project)
    expect(anyDb.bankGuarantee.findMany.mock.calls[0][0].where.OR).toEqual([
      { organizationId: "org-1" },
      { project: { organizationId: "org-1" } },
    ]);

    // g2 lapsed → status flipped; only g1 counts as active exposure
    expect(anyDb.bankGuarantee.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["g2"] } },
      data: { status: "expired" },
    });
    expect(res.kpis.totalActiveExposure).toBe(100000);
    expect(res.kpis.totalMarginHeld).toBe(10000);
    expect(res.kpis.totalCommissionPaid).toBe(3500); // across all rows
    expect(res.kpis.expiringWithin30DaysCount).toBe(1);
    expect(res.kpis.expiredCount).toBe(1);
    expect(res.kpis.activeCount).toBe(1);
    expect(res.kpis.totalCount).toBe(3);
  });
});

// ─── portfolioAlerts ────────────────────────────────────────────────────────
describe("bankGuarantee.portfolioAlerts", () => {
  it("user with nothing gets an empty alert payload", async () => {
    const loner = buildUser({ organizationId: null });
    const caller = createCaller(bankGuaranteeRouter, loner);
    const res = await caller.portfolioAlerts();
    expect(res.expiringSoon).toEqual([]);
    expect(res.totalActiveExposure).toBe(0);
  });

  it("alerts only guarantees expiring within 45 days, exposure over all active", async () => {
    const now = Date.now();
    anyDb.projectMember.findMany.mockResolvedValue([{ projectId: "p-1" }]);
    anyDb.bankGuarantee.findMany.mockResolvedValue([
      { id: "g1", amount: 75000, status: "active", expiryDate: new Date(now + 40 * DAY) },
      { id: "g2", amount: 25000, status: "active", expiryDate: new Date(now + 100 * DAY) },
    ]);
    const caller = createCaller(bankGuaranteeRouter, ENGINEER);
    const res = await caller.portfolioAlerts();

    expect(res.expiringSoon).toHaveLength(1);
    expect(res.expiringSoon[0].id).toBe("g1");
    expect(res.totalActiveExposure).toBe(100000);
  });
});

// ─── create ─────────────────────────────────────────────────────────────────
describe("bankGuarantee.create", () => {
  const baseInput = {
    type: "performance_bond" as const,
    guaranteeNumber: "BG-2082-001",
    issuingBank: "Nabil Bank",
    beneficiary: "Department of Roads",
    amount: 500000,
    issuedDate: "2026-08-01T00:00:00.000Z",
    expiryDate: "2027-08-01T00:00:00.000Z",
  };

  it("project guarantees require the Project Manager (engineer blocked)", async () => {
    member("engineer");
    const caller = createCaller(bankGuaranteeRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ ...baseInput, projectId: "p-1" }),
      "FORBIDDEN",
    );
  });

  it("org-level guarantees require user to belong to an organization", async () => {
    const noOrgUser = buildUser({ organizationId: null });
    const caller = createCaller(bankGuaranteeRouter, noOrgUser);
    await expectTRPCError(caller.create(baseInput), "FORBIDDEN");
  });

  it("expiry before issue is rejected", async () => {
    member("project_manager");
    const caller = createCaller(bankGuaranteeRouter, PM);
    await expectTRPCError(
      caller.create({
        ...baseInput,
        projectId: "p-1",
        issuedDate: "2026-08-01T00:00:00.000Z",
        expiryDate: "2026-07-01T00:00:00.000Z",
      }),
      "BAD_REQUEST",
    );
  });

  it("fiscal lock on the issue date blocks creation", async () => {
    member("project_manager");
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2081/82" });
    const caller = createCaller(bankGuaranteeRouter, PM);
    await expectTRPCError(
      caller.create({ ...baseInput, projectId: "p-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.bankGuarantee.create).not.toHaveBeenCalled();
  });

  it("rejects javascript: document URLs (stored-XSS choke point)", async () => {
    member("project_manager");
    const caller = createCaller(bankGuaranteeRouter, PM);
    await expectTRPCError(
      caller.create({ ...baseInput, projectId: "p-1", documentUrl: "javascript:alert(1)" }),
      "BAD_REQUEST",
    );
    expect(anyDb.bankGuarantee.create).not.toHaveBeenCalled();
  });

  it("stores miti auto-derived from the AD dates and computes claim expiry", async () => {
    member("project_manager");
    anyDb.bankGuarantee.create.mockResolvedValue({ id: "bg-1" });
    const caller = createCaller(bankGuaranteeRouter, PM);
    await caller.create({
      ...baseInput,
      projectId: "p-1",
      claimPeriodDays: 45,
      marginAmount: 50000,
    });

    const data = anyDb.bankGuarantee.create.mock.calls[0][0].data;
    // Real BS conversion: 2026-08-01 AD → 2083-04-16 BS (Bikram Sambat)
    expect(data.issuedMiti).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.expiryMiti).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.issuedMiti.startsWith("2083")).toBe(true);

    // claimExpiryDate = expiry + 45 days
    expect(
      data.claimExpiryDate.getTime() - new Date(baseInput.expiryDate).getTime(),
    ).toBe(45 * DAY);

    expect(data.organizationId).toBe("org-1");
    expect(data.status).toBe("active");
    expect(data.marginAmount).toBe(50000);
  });

  it("respects caller-provided miti (no overwrite)", async () => {
    member("project_manager");
    const caller = createCaller(bankGuaranteeRouter, PM);
    await caller.create({
      ...baseInput,
      projectId: "p-1",
      issuedMiti: "2083-04-16",
    });
    const data = anyDb.bankGuarantee.create.mock.calls[0][0].data;
    expect(data.issuedMiti).toBe("2083-04-16");
  });
});

// ─── extend ─────────────────────────────────────────────────────────────────
describe("bankGuarantee.extend", () => {
  function existing() {
    return {
      id: "bg-1",
      projectId: "p-1",
      organizationId: null,
      status: "active",
      expiryDate: new Date("2026-09-30T00:00:00.000Z"),
      expiryMiti: "2083-06-14",
      claimPeriodDays: 30,
      commissionPaid: 1000,
      amendments: [{ date: "2026-01-01T00:00:00.000Z", letterNo: "L-0" }],
    };
  }

  it("new expiry must be strictly after the current one", async () => {
    member("project_manager");
    anyDb.bankGuarantee.findUniqueOrThrow.mockResolvedValue(existing());
    const caller = createCaller(bankGuaranteeRouter, PM);
    await expectTRPCError(
      caller.extend({ id: "bg-1", newExpiryDate: "2026-09-30T00:00:00.000Z" }),
      "BAD_REQUEST",
    );
  });

  it("appends the amendment, accumulates commission, and recomputes claim expiry", async () => {
    member("project_manager");
    anyDb.bankGuarantee.findUniqueOrThrow.mockResolvedValue(existing());
    anyDb.bankGuarantee.findUnique.mockResolvedValue(existing()); // engine pre-read inside tx
    const caller = createCaller(bankGuaranteeRouter, PM);
    await caller.extend({
      id: "bg-1",
      newExpiryDate: "2026-12-31T00:00:00.000Z",
      amendmentLetterRef: "L-9",
      additionalCommission: 500,
      remarks: "Client approved",
    });

    // Engine transition: CAS updateMany on the pre-read status
    const call = anyDb.bankGuarantee.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "bg-1", status: "active" });
    const data = call.data;
    expect(data.status).toBe("extended");
    expect(data.commissionPaid).toBe(1500);
    expect(data.amendments).toHaveLength(2);
    expect(data.amendments[1]).toEqual(
      expect.objectContaining({ letterNo: "L-9", additionalCommission: 500 }),
    );
    expect(data.claimExpiryDate.getTime() - new Date("2026-12-31T00:00:00.000Z").getTime()).toBe(30 * DAY);
    expect(data.expiryMiti).toMatch(/^\d{4}-\d{2}-\d{2}$/); // auto-derived
  });

  it("engineer cannot extend a project guarantee", async () => {
    member("engineer");
    anyDb.bankGuarantee.findUniqueOrThrow.mockResolvedValue(existing());
    const caller = createCaller(bankGuaranteeRouter, ENGINEER);
    await expectTRPCError(
      caller.extend({ id: "bg-1", newExpiryDate: "2026-12-31T00:00:00.000Z" }),
      "FORBIDDEN",
    );
  });
});

// ─── release / update / delete ──────────────────────────────────────────────
describe("bankGuarantee release/update/delete", () => {
  it("release flips status and appends the letter reference to notes", async () => {
    member("project_manager");
    anyDb.bankGuarantee.findUniqueOrThrow.mockResolvedValue({
      id: "bg-1",
      projectId: "p-1",
      organizationId: null,
      notes: "Original note",
      status: "active",
    });
    anyDb.bankGuarantee.findUnique.mockResolvedValue({
      id: "bg-1",
      projectId: "p-1",
      organizationId: null,
      notes: "Original note",
      status: "active",
    });
    const caller = createCaller(bankGuaranteeRouter, PM);
    await caller.release({ id: "bg-1", releaseLetterRef: "RL-7", notes: "Done" });

    const call = anyDb.bankGuarantee.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "bg-1", status: "active" }); // CAS claim
    const data = call.data;
    expect(data.status).toBe("released");
    expect(data.notes).toContain("Released with Ref: RL-7");
    expect(data.notes).toContain("Original note");
  });

  it("update: org-level guarantee of ANOTHER org is FORBIDDEN (cross-tenant)", async () => {
    const caller = createCaller(bankGuaranteeRouter, ORG_ADMIN);
    anyDb.bankGuarantee.findUniqueOrThrow.mockResolvedValue({
      id: "bg-x",
      projectId: null,
      organizationId: "org-2",
    });
    await expectTRPCError(
      caller.update({ id: "bg-x", beneficiary: "X" }),
      "FORBIDDEN",
    );
    expect(anyDb.bankGuarantee.update).not.toHaveBeenCalled();
  });

  it("update: negative amount is rejected (zod guard)", async () => {
    member("project_manager");
    anyDb.bankGuarantee.findUniqueOrThrow.mockResolvedValue({
      id: "bg-1",
      projectId: "p-1",
      organizationId: null,
    });
    const caller = createCaller(bankGuaranteeRouter, PM);
    await expectTRPCError(
      caller.update({ id: "bg-1", amount: -500 }),
      "BAD_REQUEST",
    );
  });

  it("delete enforces the same access rule", async () => {
    member("engineer");
    anyDb.bankGuarantee.findUniqueOrThrow.mockResolvedValue({
      id: "bg-1",
      projectId: "p-1",
      organizationId: null,
    });
    const caller = createCaller(bankGuaranteeRouter, ENGINEER);
    await expectTRPCError(caller.delete({ id: "bg-1" }), "FORBIDDEN");
    expect(anyDb.bankGuarantee.delete).not.toHaveBeenCalled();
  });

  it("create posts to HeadOfficeExpense and decrements CompanyBankAccount when postToDayBook is true", async () => {
    member("project_manager");
    anyDb.bankGuarantee.create.mockResolvedValue({ id: "bg-1", guaranteeNumber: "BG-2082-001" });
    anyDb.headOfficeExpense.create.mockResolvedValue({ id: "exp-1" });
    anyDb.companyBankAccount.update.mockResolvedValue({ id: "bank-1" });

    const caller = createCaller(bankGuaranteeRouter, PM);
    await caller.create({
      type: "performance_bond" as const,
      guaranteeNumber: "BG-2082-001",
      issuingBank: "Nabil Bank",
      beneficiary: "Department of Roads",
      amount: 500000,
      issuedDate: "2026-08-01T00:00:00.000Z",
      expiryDate: "2027-08-01T00:00:00.000Z",
      commissionPaid: 7500,
      postToDayBook: true,
      bankAccountId: "bank-1",
      projectId: "p-1",
    });

    expect(anyDb.headOfficeExpense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "Bank Charges & Guarantee Fees",
          amount: 7500,
          bankAccountId: "bank-1",
          voucherNo: "BG-COMM-BG-2082-001",
        }),
      })
    );
    // P2 item 30: the decrement is a guarded atomic raw UPDATE now
    // (insufficient-funds check in the WHERE clause).
    const dec1 = anyDb.$executeRaw.mock.calls.find((c: any[]) => c[0].join("?").includes('UPDATE "CompanyBankAccount"'));
    expect(dec1).toBeDefined();
    expect(dec1[0].join("?")).toContain('"currentBalance" - ? >= 0');
    expect(dec1.slice(1)).toContain("bank-1");
    expect(dec1.slice(1)).toContain(7500);
  });

  it("update synchronizes linked Day Book voucher and adjusts bank balances", async () => {
    member("project_manager");
    anyDb.bankGuarantee.findUniqueOrThrow.mockResolvedValue({
      id: "bg-1",
      guaranteeNumber: "BG-2082-001",
      issuingBank: "Nabil Bank",
      beneficiary: "DoR",
      commissionPaid: 7500,
      issuedDate: new Date("2026-08-01"),
      expiryDate: new Date("2027-08-01"),
      projectId: "p-1",
      organizationId: "org-1",
    });
    anyDb.headOfficeExpense.findFirst.mockResolvedValue({
      id: "exp-1",
      amount: 7500,
      bankAccountId: "bank-1",
      date: new Date("2026-08-01"),
      miti: "2083-04-16",
    });
    anyDb.bankGuarantee.update.mockResolvedValue({ id: "bg-1", guaranteeNumber: "BG-2082-001" });
    anyDb.headOfficeExpense.update.mockResolvedValue({ id: "exp-1" });
    anyDb.companyBankAccount.update.mockResolvedValue({ id: "bank-1" });

    const caller = createCaller(bankGuaranteeRouter, PM);
    await caller.update({
      id: "bg-1",
      commissionPaid: 9000,
      bankAccountId: "bank-2",
      postToDayBook: true,
    });

    // Restores old bank account
    expect(anyDb.companyBankAccount.update).toHaveBeenCalledWith({
      where: { id: "bank-1" },
      data: { currentBalance: { increment: toMoney(7500) } },
    });
    // Updates expense
    expect(anyDb.headOfficeExpense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exp-1" },
        data: expect.objectContaining({
          amount: 9000,
          bankAccountId: "bank-2",
        }),
      })
    );
    // Decrements new bank account (guarded atomic raw UPDATE — P2 item 30)
    const dec2 = anyDb.$executeRaw.mock.calls.filter((c: any[]) => c[0].join("?").includes('UPDATE "CompanyBankAccount"'));
    expect(dec2.length).toBeGreaterThan(0);
    const last = dec2[dec2.length - 1];
    expect(last.slice(1)).toContain("bank-2");
    expect(last.slice(1)).toContain(9000);
  });

  it("delete removes linked Day Book voucher and restores bank balance", async () => {
    member("project_manager");
    anyDb.bankGuarantee.findUniqueOrThrow.mockResolvedValue({
      id: "bg-1",
      guaranteeNumber: "BG-2082-001",
      projectId: "p-1",
      organizationId: "org-1",
    });
    anyDb.headOfficeExpense.findFirst.mockResolvedValue({
      id: "exp-1",
      amount: 7500,
      bankAccountId: "bank-1",
    });
    anyDb.bankGuarantee.delete.mockResolvedValue({ id: "bg-1" });
    anyDb.headOfficeExpense.delete.mockResolvedValue({ id: "exp-1" });
    anyDb.companyBankAccount.update.mockResolvedValue({ id: "bank-1" });

    const caller = createCaller(bankGuaranteeRouter, PM);
    await caller.delete({ id: "bg-1" });

    expect(anyDb.companyBankAccount.update).toHaveBeenCalledWith({
      where: { id: "bank-1" },
      data: { currentBalance: { increment: toMoney(7500) } },
    });
    expect(anyDb.headOfficeExpense.delete).toHaveBeenCalledWith({
      where: { id: "exp-1" },
    });
    expect(anyDb.bankGuarantee.delete).toHaveBeenCalledWith({
      where: { id: "bg-1" },
    });
  });
});
