/**
 * Router-layer tests for the IPC (Interim Payment Certificate) router.
 *
 * Pins:
 *   - Duplicate IPC numbers are rejected per project (CONFLICT)
 *   - Status machine: draft → submitted → certified → approved → paid;
 *     skipping certification is rejected; certify/approve/pay needs
 *     PM/coordinator
 *   - Certification posts the revenue JE exactly ONCE (idempotency guard)
 *   - Line items are locked once certified (no silent GL divergence)
 *   - loadBoq copies the CONTRACT BOQ rate verbatim — BOQ Rate and RA
 *     Rate are independent by design (workspace rule)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { ipcRouter } from "../ipc";

const anyDb = db as any;
const ENGINEER = buildUser();
const PM = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── create ──────────────────────────────────────────────────────────────────
describe("ipc.create", () => {
  const createInput = { projectId: "p-1", number: "IPC-001" };

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(ipcRouter, ENGINEER);
    await expectTRPCError(caller.create(createInput), "FORBIDDEN");
    expect(anyDb.ipc.create).not.toHaveBeenCalled();
  });

  it("CONFLICTs on a duplicate IPC number within the project", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue({ id: "existing-ipc" });
    const caller = createCaller(ipcRouter, ENGINEER);
    await expectTRPCError(caller.create(createInput), "CONFLICT");
    expect(anyDb.ipc.create).not.toHaveBeenCalled();
  });

  it("applies Nepal VAT/TDS defaults and creates the IPC", async () => {
    member("engineer");
    anyDb.ipc.create.mockResolvedValue({ id: "ipc-1", number: "IPC-001" });
    const caller = createCaller(ipcRouter, ENGINEER);
    const res = await caller.create(createInput);

    expect(res.ipc.id).toBe("ipc-1");
    const createData = anyDb.ipc.create.mock.calls[0][0].data;
    expect(createData.vatPercent).toBe(13);
    expect(createData.tdsPercent).toBe(1.5);
    expect(createData.retention).toBe(0);
  });
});

// ─── update (status machine) ─────────────────────────────────────────────────
describe("ipc.update status machine", () => {
  function ipcRow(status: string) {
    return {
      projectId: "p-1",
      subcontractorId: null,
      status,
      issueDate: null,
    };
  }

  it("NOT_FOUNDs an unknown IPC", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue(null);
    const caller = createCaller(ipcRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ ipcId: "ipc-1", status: "submitted" }),
      "NOT_FOUND",
    );
  });

  it("BAD_REQUESTs skipping certification (draft → paid)", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue(ipcRow("draft"));
    const caller = createCaller(ipcRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ ipcId: "ipc-1", status: "paid" }),
      "BAD_REQUEST",
    );
    expect(anyDb.ipc.updateMany).not.toHaveBeenCalled();
  });

  it("allows draft → submitted for any writer", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue(ipcRow("draft"));

    const caller = createCaller(ipcRouter, ENGINEER);
    await caller.update({ ipcId: "ipc-1", status: "submitted" });

    expect(anyDb.ipc.updateMany).toHaveBeenCalled();
    expect(anyDb.journalEntry.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs certification by non-PM roles", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue(ipcRow("submitted"));
    const caller = createCaller(ipcRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ ipcId: "ipc-1", status: "certified" }),
      "FORBIDDEN",
    );
    expect(anyDb.ipc.updateMany).not.toHaveBeenCalled();
  });

  it("PM certification posts the balanced revenue JE exactly once", async () => {
    member("project_manager");
    anyDb.ipc.findUnique
      // 1st: route pre-read, 2nd: engine entity fetch, 3rd: engine re-fetch
      .mockResolvedValueOnce(ipcRow("submitted"))
      .mockResolvedValueOnce(ipcRow("submitted"))
      // 4th: certified IPC totals inside the tx (JE block)
      .mockResolvedValue({
        id: "ipc-1",
        number: "IPC-001",
        grossAmount: 100000,
        vatAmount: 13000,
        retentionAmount: 5000,
        tdsAmount: 1500,
        projectId: "p-1",
      });

    const caller = createCaller(ipcRouter, PM);
    await caller.update({ ipcId: "ipc-1", status: "certified" });

    const jeData = anyDb.journalEntry.create.mock.calls[0][0].data;
    expect(jeData.source).toBe("ipc");
    expect(jeData.totalDebit).toBe(113000);
    expect(jeData.totalCredit).toBe(113000);

    // Dr 1100 (net receivable 106500) + Dr 1110 (retention) + Dr 1400 (TDS)
    //   = Cr 4001 (revenue 100000) + Cr 2021 (VAT 13000)
    const lines = jeData.lines.create;
    expect(lines.map((l: any) => l.accountCode)).toEqual([
      "1100", "1110", "1400", "4001", "2021",
    ]);
    expect(lines[0]).toMatchObject({ debit: 106500 });
    expect(lines[3]).toMatchObject({ credit: 100000 });
  });

  it("re-certification does NOT double-post the revenue JE (idempotency)", async () => {
    member("project_manager");
    anyDb.ipc.findUnique.mockResolvedValue(ipcRow("submitted"));
    // existing JE for this IPC → skip
    anyDb.journalEntry.findFirst.mockResolvedValue({ id: "je-1", entryNumber: "JE-2026-0001" });

    const caller = createCaller(ipcRouter, PM);
    await caller.update({ ipcId: "ipc-1", status: "certified" });

    expect(anyDb.journalEntry.create).not.toHaveBeenCalled();
  });

  it("CONFLICTs when a concurrent certification wins the race (CAS regression)", async () => {
    member("project_manager");
    anyDb.ipc.findUnique.mockResolvedValue(ipcRow("submitted"));
    // engine CAS matches 0 rows → another user already transitioned the IPC
    anyDb.ipc.updateMany.mockResolvedValue({ count: 0 });

    const caller = createCaller(ipcRouter, PM);
    await expectTRPCError(
      caller.update({ ipcId: "ipc-1", status: "certified" }),
      "CONFLICT",
    );
    // the losing transaction must not post the revenue JE
    expect(anyDb.journalEntry.create).not.toHaveBeenCalled();
  });
});

// ─── updateItem ──────────────────────────────────────────────────────────────
describe("ipc.updateItem", () => {
  it("FORBIDDENs edits on a certified IPC (GL divergence lock)", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue({
      projectId: "p-1",
      status: "certified",
      retention: 0,
      advanceRecovery: 0,
      subcontractorId: null,
    });
    const caller = createCaller(ipcRouter, ENGINEER);
    await expectTRPCError(
      caller.updateItem({ ipcId: "ipc-1", itemId: "item-1", thisQty: 10 }),
      "FORBIDDEN",
    );
    expect(anyDb.ipcItem.update).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs an item that belongs to a different IPC", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue({
      projectId: "p-1",
      status: "draft",
      retention: 0,
      advanceRecovery: 0,
      subcontractorId: null,
    });
    anyDb.ipcItem.findUnique.mockResolvedValue({
      id: "item-1",
      ipcId: "ipc-OTHER",
      thisQty: 0,
      previousQty: 0,
      rate: 500,
    });
    const caller = createCaller(ipcRouter, ENGINEER);
    await expectTRPCError(
      caller.updateItem({ ipcId: "ipc-1", itemId: "item-1", thisQty: 10 }),
      "NOT_FOUND",
    );
  });

  it("recomputes amount = thisQty × CONTRACT rate server-side", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue({
      id: "ipc-1",
      projectId: "p-1",
      status: "draft",
      retention: 0,
      advanceRecovery: 0,
      subcontractorId: null,
    });
    anyDb.ipcItem.findUnique.mockResolvedValue({
      id: "item-1",
      ipcId: "ipc-1",
      thisQty: 2,
      previousQty: 3,
      rate: 500, // contract BOQ rate — server value wins
    });

    const caller = createCaller(ipcRouter, ENGINEER);
    await caller.updateItem({ ipcId: "ipc-1", itemId: "item-1", thisQty: 10 });

    const updateData = anyDb.ipcItem.update.mock.calls[0][0].data;
    expect(updateData.thisQty).toBe(10);
    expect(updateData.cumQty).toBe(13); // previous 3 + this 10
    expect(updateData.amount).toBe(5000); // 10 × 500 (rate NOT client-supplied)
  });
});

// ─── loadBoq ─────────────────────────────────────────────────────────────────
describe("ipc.loadBoq", () => {
  it("FORBIDDENs reloading BOQ on a certified IPC", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue({
      projectId: "p-1",
      status: "certified",
      subcontractorId: null,
    });
    const caller = createCaller(ipcRouter, ENGINEER);
    await expectTRPCError(caller.loadBoq({ ipcId: "ipc-1" }), "FORBIDDEN");
    expect(anyDb.ipcItem.createMany).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs when the project has no BOQ items", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue({
      projectId: "p-1",
      status: "draft",
      subcontractorId: null,
    });
    anyDb.boqItem.findMany.mockResolvedValue([]);
    const caller = createCaller(ipcRouter, ENGINEER);
    await expectTRPCError(caller.loadBoq({ ipcId: "ipc-1" }), "BAD_REQUEST");
  });

  it("copies BOQ contract rate and qty verbatim, zeroing progress", async () => {
    member("engineer");
    anyDb.ipc.findUnique.mockResolvedValue({
      id: "ipc-1",
      projectId: "p-1",
      status: "draft",
      subcontractorId: null,
    });
    anyDb.boqItem.findMany.mockResolvedValue([
      {
        code: "B-001",
        description: "Earth excavation",
        unit: "cum",
        section: "Earthworks",
        quantity: 100,
        rate: 250, // contract BOQ rate
      },
    ]);

    const caller = createCaller(ipcRouter, ENGINEER);
    await caller.loadBoq({ ipcId: "ipc-1" });

    // Fresh load: previous items are cleared…
    expect(anyDb.ipcItem.deleteMany).toHaveBeenCalledWith({
      where: { ipcId: "ipc-1" },
    });

    // …and replaced with the BOQ lines at CONTRACT rates.
    // NOTE: this is the BOQ Rate — the rate-analysis (RA) rate is a
    // SEPARATE engine and must never be mixed in here (platform rule:
    // BOQ Rate and RA Rate are forever independent).
    const items = anyDb.ipcItem.createMany.mock.calls[0][0].data;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      boqCode: "B-001",
      contractQty: 100,
      rate: 250,
      previousQty: 0,
      thisQty: 0,
      cumQty: 0,
      amount: 0,
    });
  });
});

// ─── update: subcontractor-IPC cost auto-capture (B7) ────────────────────────
describe("ipc.update — ProjectCost auto-capture on certification", () => {
  // Local copy — the ipcRow helper in the status-machine describe is block-scoped.
  function ipcRow(status: string) {
    return {
      projectId: "p-1",
      subcontractorId: null,
      status,
      issueDate: null,
    };
  }

  it("captures subcontractor billing into the cost ledger (source 'ipc')", async () => {
    member("project_manager");
    anyDb.ipc.findUnique
      .mockResolvedValueOnce({ ...ipcRow("submitted"), subcontractorId: "sub-1" })
      .mockResolvedValueOnce({ ...ipcRow("submitted"), subcontractorId: "sub-1" })
      .mockResolvedValue({
        id: "ipc-1",
        number: "IPC-001",
        grossAmount: 100000,
        vatAmount: 13000,
        retentionAmount: 5000,
        tdsAmount: 1500,
        projectId: "p-1",
        issueDate: new Date("2025-07-25"),
        subcontractor: { name: "Kathmandu Builders" },
      });
    anyDb.projectCost.findFirst.mockResolvedValue(null); // not yet captured

    const caller = createCaller(ipcRouter, PM);
    await caller.update({ ipcId: "ipc-1", status: "certified" });

    expect(anyDb.projectCost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p-1",
        amount: 100000,
        category: "subcontractor",
        subcontractorId: "sub-1",
        vendor: "Kathmandu Builders",
        source: "ipc",
        sourceRef: "IPC-001",
        sourceRefId: "ipc-1",
      }),
    });
  });

  it("does NOT capture client IPCs (billing inflow, not cost)", async () => {
    member("project_manager");
    anyDb.ipc.findUnique
      .mockResolvedValueOnce(ipcRow("submitted"))
      .mockResolvedValueOnce(ipcRow("submitted"))
      .mockResolvedValue({
        id: "ipc-1",
        number: "IPC-001",
        grossAmount: 100000,
        vatAmount: 13000,
        retentionAmount: 5000,
        tdsAmount: 1500,
        projectId: "p-1",
        issueDate: new Date("2025-07-25"),
        subcontractor: null,
      });

    const caller = createCaller(ipcRouter, PM);
    await caller.update({ ipcId: "ipc-1", status: "certified" });
    expect(anyDb.projectCost.create).not.toHaveBeenCalled();
  });

  it("does not re-capture when a cost row already exists (idempotency)", async () => {
    member("project_manager");
    anyDb.ipc.findUnique
      .mockResolvedValueOnce({ ...ipcRow("submitted"), subcontractorId: "sub-1" })
      .mockResolvedValueOnce({ ...ipcRow("submitted"), subcontractorId: "sub-1" })
      .mockResolvedValue({
        id: "ipc-1",
        number: "IPC-001",
        grossAmount: 100000,
        vatAmount: 13000,
        retentionAmount: 5000,
        tdsAmount: 1500,
        projectId: "p-1",
        issueDate: new Date("2025-07-25"),
        subcontractor: { name: "Kathmandu Builders" },
      });
    anyDb.journalEntry.findFirst.mockResolvedValue({ id: "je-1" }); // JE already posted
    anyDb.projectCost.findFirst.mockResolvedValue({ id: "cost-1" }); // cost already captured

    const caller = createCaller(ipcRouter, PM);
    await caller.update({ ipcId: "ipc-1", status: "certified" });
    expect(anyDb.projectCost.create).not.toHaveBeenCalled();
  });
});

// ─── taxSummary: BS fiscal-quarter grouping (B1) ─────────────────────────────
describe("ipc.taxSummary — Nepal BS fiscal-quarter grouping", () => {
  it("groups VAT/TDS by BS fiscal quarter, not AD calendar month", async () => {
    member("engineer");
    // 2025-07-25 = Shrawan 2082 (Q1) and 2025-08-25 = Bhadra 2082 (Q1):
    // two different AD months, ONE BS fiscal quarter → must land in one
    // bucket (the pre-fix AD-month grouping would have split them).
    // 2025-11-05 = Kartik 2082 (Q2) → second bucket.
    anyDb.ipc.findMany.mockResolvedValue([
      {
        id: "ipc-1", number: "IPC-001", period: null, status: "certified",
        issueDate: new Date("2025-07-25"), createdAt: new Date("2025-07-25"),
        grossAmount: 1000, vatAmount: 130, tdsAmount: 15,
        retentionAmount: 50, advanceRecovery: 0, finalPayable: 1065,
        vatPercent: 13, tdsPercent: 1.5, subcontractor: null, _count: { items: 3 },
      },
      {
        id: "ipc-2", number: "IPC-002", period: null, status: "certified",
        issueDate: new Date("2025-08-25"), createdAt: new Date("2025-08-25"),
        grossAmount: 2000, vatAmount: 260, tdsAmount: 30,
        retentionAmount: 100, advanceRecovery: 0, finalPayable: 2130,
        vatPercent: 13, tdsPercent: 1.5, subcontractor: null, _count: { items: 2 },
      },
      {
        id: "ipc-3", number: "IPC-003", period: null, status: "certified",
        issueDate: new Date("2025-11-05"), createdAt: new Date("2025-11-05"),
        grossAmount: 3000, vatAmount: 390, tdsAmount: 45,
        retentionAmount: 150, advanceRecovery: 0, finalPayable: 3195,
        vatPercent: 13, tdsPercent: 1.5, subcontractor: null, _count: { items: 1 },
      },
    ]);

    const caller = createCaller(ipcRouter, ENGINEER);
    const res = await caller.taxSummary({ projectId: "p-1" });

    expect(res.byQuarter).toHaveLength(2);
    expect(res.byQuarter[0]).toMatchObject({
      key: "2082/83-Q1",
      fiscalYear: "2082/83",
      quarter: 1,
      count: 2,
      grossAmount: 3000,
      vatAmount: 390,
      tdsAmount: 45,
    });
    expect(res.byQuarter[1]).toMatchObject({
      key: "2082/83-Q2",
      quarter: 2,
      count: 1,
      vatAmount: 390,
    });
    // totals unchanged by the regrouping
    expect(res.totals.totalVat).toBe(780);
    expect(res.totals.totalTds).toBe(90);
  });
});
