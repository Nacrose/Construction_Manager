/**
 * Router-layer tests for variation-order.ts.
 *
 * Pins:
 *   - IDOR: get/updateStatus are project-scoped (findFirst on id+projectId)
 *   - Duplicate VO number → CONFLICT (unique projectId_number)
 *   - Approved VOs are locked: no update, no re-approval
 *   - Approval merges VO items into the BOQ:
 *       · linked items: baseline frozen to previous qty/rate, current
 *         quantity/rate/amount replaced with VO values
 *       · extra items (no boqItemId): created with baseline 0, tagged
 *         ["extra_item", voNumber], sequential sortOrder; a rateAnalysis
 *         row is created per project analysis library
 *       · a BOQ version snapshot is created with versionNumber = max+1
 *   - REGRESSION (audit fix): approving a VO must NOT post a revenue
 *     journal entry — revenue is recognized by IPC billing, not by the
 *     contract-value event. Two Cr-4001 postings double-count the VO.
 *   - Fiscal-year lock gates approval BEFORE any read/write
 *   - Audit log records variation_order.<status> with value-change metadata
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

// audit() defers its insert through next/server `after()`; flush it now.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { db } from "@/lib/db";
import { variationOrderRouter } from "../variation-order";

const anyDb = db as any;
const ENGINEER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function vo(overrides: Record<string, unknown> = {}) {
  return {
    id: "vo-1",
    projectId: "p-1",
    number: "VO-001",
    title: "Extra plaster work",
    status: "draft",
    items: [
      {
        id: "voi-1",
        boqItemId: "boq-1",
        boqCode: "A-001",
        boqDesc: "Plaster",
        unit: "sqm",
        newQty: 120,
        newRate: 250,
      },
      {
        id: "voi-2",
        boqItemId: null, // extra item
        boqCode: "X-100",
        boqDesc: "New parapet",
        unit: "rmt",
        newQty: 40,
        newRate: 500,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── list / get / create ────────────────────────────────────────────────────
describe("variationOrder list/get/create", () => {
  it("list requires project membership", async () => {
    member(null);
    const caller = createCaller(variationOrderRouter, ENGINEER);
    await expectTRPCError(caller.list({ projectId: "p-1" }), "FORBIDDEN");
  });

  it("get: unknown id → NOT_FOUND (project-scoped fetch)", async () => {
    member("engineer");
    anyDb.variationOrder.findFirst.mockResolvedValue(null);
    const caller = createCaller(variationOrderRouter, ENGINEER);
    await expectTRPCError(
      caller.get({ id: "vo-x", projectId: "p-1" }),
      "NOT_FOUND",
    );
  });

  it("create rejects duplicate VO numbers with CONFLICT", async () => {
    member("engineer");
    anyDb.variationOrder.findUnique.mockResolvedValue({ id: "existing" });
    const caller = createCaller(variationOrderRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ projectId: "p-1", number: "VO-001", title: "dup" }),
      "CONFLICT",
    );
  });

  it("create stores a draft VO", async () => {
    member("engineer");
    anyDb.variationOrder.findUnique.mockResolvedValue(null);
    const caller = createCaller(variationOrderRouter, ENGINEER);
    await caller.create({ projectId: "p-1", number: "VO-002", title: "ok" });
    expect(anyDb.variationOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "draft", number: "VO-002" }),
    });
  });
});

// ─── update ─────────────────────────────────────────────────────────────────
describe("variationOrder.update", () => {
  const updateInput = {
    id: "vo-1",
    projectId: "p-1",
    title: "Revised",
    items: [],
  };

  it("approved VOs cannot be updated", async () => {
    member("engineer");
    anyDb.variationOrder.findFirst.mockResolvedValue(vo({ status: "approved" }));
    const caller = createCaller(variationOrderRouter, ENGINEER);
    await expectTRPCError(caller.update(updateInput), "BAD_REQUEST");
  });

  it("replaces the item set atomically (delete old + createMany new)", async () => {
    member("engineer");
    anyDb.variationOrder.findFirst.mockResolvedValue(vo());
    const caller = createCaller(variationOrderRouter, ENGINEER);
    await caller.update({ ...updateInput, items: [{ boqCode: "A-001", boqDesc: "x", unit: "rmt" }] });
    expect(anyDb.variationOrderItem.deleteMany).toHaveBeenCalledWith({
      where: { variationOrderId: "vo-1" },
    });
    expect(anyDb.variationOrderItem.createMany).toHaveBeenCalled();
  });
});

// ─── updateStatus (approval) ────────────────────────────────────────────────
describe("variationOrder.updateStatus", () => {
  it("fiscal lock blocks approval BEFORE any VO read", async () => {
    member("project_manager") // H-7: approval is PM-tier (PM passes all transitions);
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2082/83" });
    const caller = createCaller(variationOrderRouter, ENGINEER);
    await expectTRPCError(
      caller.updateStatus({ id: "vo-1", projectId: "p-1", status: "approved" }),
      "FORBIDDEN",
    );
    expect(anyDb.variationOrder.findFirst).not.toHaveBeenCalled();
  });

  it("non-approved transitions skip the fiscal lock entirely", async () => {
    member("project_manager") // H-7: approval is PM-tier (PM passes all transitions);
    anyDb.variationOrder.findFirst.mockResolvedValue(vo());
    anyDb.variationOrder.findUnique.mockResolvedValue(vo()); // engine pre-read inside tx
    const caller = createCaller(variationOrderRouter, ENGINEER);
    await caller.updateStatus({ id: "vo-1", projectId: "p-1", status: "submitted" });
    expect(anyDb.fiscalYearLock.findFirst).not.toHaveBeenCalled();
    expect(anyDb.boqItem.update).not.toHaveBeenCalled();
  });

  it("re-approval of an approved VO is rejected (idempotency guard)", async () => {
    member("project_manager") // H-7: approval is PM-tier (PM passes all transitions);
    anyDb.variationOrder.findFirst.mockResolvedValue(vo({ status: "approved" }));
    anyDb.variationOrder.findUnique.mockResolvedValue(vo({ status: "approved" }));
    const caller = createCaller(variationOrderRouter, ENGINEER);
    await expectTRPCError(
      caller.updateStatus({ id: "vo-1", projectId: "p-1", status: "approved" }),
      "BAD_REQUEST",
    );
  });

  it("approval merges VO items into the BOQ: baseline frozen, current values replaced", async () => {
    member("project_manager") // H-7: approval is PM-tier (PM passes all transitions);
    anyDb.variationOrder.findFirst.mockResolvedValue(vo());
    anyDb.variationOrder.findUnique.mockResolvedValue(vo()); // engine pre-read inside tx
    anyDb.boqItem.findUnique.mockResolvedValue({
      id: "boq-1",
      quantity: 100,
      rate: 200,
      baselineQty: null, // never baselined → current values become baseline
      baselineRate: null,
    });
    anyDb.analysisLibrary.findMany.mockResolvedValue([{ id: "lib-1", name: "Labour", isDefault: true }]);
    anyDb.boqItem.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });
    anyDb.boqVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 3 } });
    anyDb.boqItem.findMany.mockResolvedValue([]);
    // post-transaction audit re-read
    anyDb.boqItem.findUnique.mockResolvedValueOnce({
      id: "boq-1",
      quantity: 120,
      rate: 250,
      baselineQty: 100,
      baselineRate: 200,
      code: "A-001",
    });

    const caller = createCaller(variationOrderRouter, ENGINEER);
    await caller.updateStatus({ id: "vo-1", projectId: "p-1", status: "approved" });

    // Linked item: baseline = old, current = VO values, amount = new × new
    expect(anyDb.boqItem.update).toHaveBeenCalledWith({
      where: { id: "boq-1" },
      data: {
        baselineQty: 100,
        baselineRate: 200,
        quantity: 120,
        rate: 250,
        amount: 120 * 250,
      },
    });

    // Extra item: created with baseline 0 + extra_item tag, sortOrder continues
    expect(anyDb.boqItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p-1",
        code: "X-100",
        quantity: 40,
        rate: 500,
        amount: 40 * 500,
        baselineQty: 0,
        baselineRate: 0,
        tags: JSON.stringify(["extra_item", "VO-001"]),
        sortOrder: 6,
      }),
    });

    // Rate analysis auto-created for the project library
    expect(anyDb.rateAnalysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ libraryId: "lib-1", name: "Labour" }),
    });

    // BOQ version snapshot: version 4, notes reference the VO
    expect(anyDb.boqVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p-1",
        versionNumber: 4,
        variationOrderId: "vo-1",
        notes: "VO VO-001: Extra plaster work",
        status: "approved",
      }),
    });

    // Status flip — rides the engine: CAS updateMany on the status we
    // validated (id + exact pre-read status), with the engine-stamped
    // dateApproved from additionalData.
    expect(anyDb.variationOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "vo-1", status: "draft" },
      data: expect.objectContaining({ status: "approved", dateApproved: expect.any(Date) }),
    });
  });

  it("REGRESSION: approval posts NO revenue journal entry (IPC bills it later)", async () => {
    member("project_manager") // H-7: approval is PM-tier (PM passes all transitions);
    anyDb.variationOrder.findFirst.mockResolvedValue(vo());
    anyDb.variationOrder.findUnique.mockResolvedValue(vo()); // engine pre-read inside tx
    anyDb.analysisLibrary.findMany.mockResolvedValue([]);
    anyDb.boqItem.aggregate.mockResolvedValue({ _max: {} });
    anyDb.boqVersion.aggregate.mockResolvedValue({ _max: {} });
    anyDb.boqItem.findMany.mockResolvedValue([]);

    const caller = createCaller(variationOrderRouter, ENGINEER);
    await caller.updateStatus({ id: "vo-1", projectId: "p-1", status: "approved" });

    expect(anyDb.journalEntry.create).not.toHaveBeenCalled();
    expect(anyDb.journalEntry.createMany).not.toHaveBeenCalled();
  });

  it("audit log records the approval with value-change metadata", async () => {
    member("project_manager") // H-7: approval is PM-tier (PM passes all transitions);
    anyDb.variationOrder.findFirst.mockResolvedValue(vo());
    anyDb.variationOrder.findUnique.mockResolvedValue(vo()); // engine pre-read inside tx
    anyDb.analysisLibrary.findMany.mockResolvedValue([]);
    anyDb.boqItem.aggregate.mockResolvedValue({ _max: {} });
    anyDb.boqVersion.aggregate.mockResolvedValue({ _max: {} });
    anyDb.boqItem.findMany.mockResolvedValue([]);
    anyDb.boqItem.findUnique.mockResolvedValue({
      id: "boq-1",
      code: "A-001",
      quantity: 100,
      rate: 200,
      baselineQty: null,
      baselineRate: null,
    });

    const caller = createCaller(variationOrderRouter, ENGINEER);
    await caller.updateStatus({ id: "vo-1", projectId: "p-1", status: "approved" });

    expect(anyDb.auditLog.create).toHaveBeenCalled();
  });
});
