/**
 * Router-layer tests for daily-report.ts (core procedures only —
 * attachment procedures live in daily-report-attachments.ts and are
 * covered by their own test file).
 *
 * Pins:
 *   - listReports: project scoping; legacy status filter mapping
 *     (submitted ⊇ "checked", draft ⊇ "rejected") + output normalization
 *   - getReport: NOT_FOUND; cross-project FORBIDDEN; daily-program
 *     merge with carried-over tasks (isCarriedOver + carriedFromDate)
 *   - createReport: read-only role gate; duplicate number CONFLICT;
 *     reportDate normalization (YYYY-MM-DD → UTC midnight); dayOfWeek
 *     derivation; materialConsumed passthrough into syncNormalizedTables
 *     (regression: the create schema used to omit the field so the sync
 *     always received undefined)
 *   - updateReport: draft-only field edits; admin-only status machine
 *     (draft→submitted, submitted→draft/approved, approved→archived/
 *     submitted); submitted stamps; approval stamps
 *     approvedAt/clientApprovedAt/clientApprovedById
 *   - approval inventory deduction: manual materialConsumed rows → one
 *     "issue" MaterialTransaction each at the latest receive rate, stock
 *     decremented and clamped at 0; idempotency guard (re-approval after
 *     revert must NOT deduct twice); theoretical deduction from
 *     workProgress × BOQ ingredients when no manual consumption
 *   - approval/submit fiscal-lock gate (regression: the deduction wrote
 *     MaterialTransaction + stock updates with no assertNotLocked while
 *     createTransaction enforces it)
 *   - deleteReport: draft-only for non-admins; PM can delete any;
 *     attachment storage cleanup before the row delete; cross-project
 *     FORBIDDEN
 *   - emailReport: multi-recipient fan-out, partial vs total SMTP
 *     failure, HTML escaping of untrusted report/project fields
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

// audit() defers its insert via next/server `after` — flush synchronously.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(async () => ({ url: "/api/files/stored-1", key: "stored-1" })),
  deleteFile: vi.fn(async () => undefined),
}));

vi.mock("@/server/utils/email", () => ({
  escapeHtml: (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    ),
  sendEmail: vi.fn(async () => true),
  notifyUserEmail: vi.fn(),
  emailTemplates: {},
}));

import { db } from "@/lib/db";
import { deleteFile } from "@/lib/storage";
import { sendEmail } from "@/server/utils/email";
import { dailyReportRouter } from "../daily-report";

const anyDb = db as any;
const ENGINEER = buildUser({ id: "eng-1" });
const PM = buildUser({ id: "pm-1" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: "r-1",
    projectId: "p-1",
    number: "DR-001",
    status: "draft",
    createdById: "eng-1",
    reportDate: new Date("2026-01-15T12:00:00.000Z"),
    dayOfWeek: "Thursday",
    preparedAt: null,
    submittedAt: null,
    submittedById: null,
    approvedAt: null,
    approvedById: null,
    clientApprovedAt: null,
    clientApprovedById: null,
    archivedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── listReports ────────────────────────────────────────────────────────────
describe("dailyReport.listReports", () => {
  it("scopes to the project and expands legacy statuses in the filter + output", async () => {
    member("engineer");
    anyDb.dailyReport.findMany.mockResolvedValue([
      { id: "a", status: "checked" },
      { id: "b", status: "submitted" },
    ]);
    const caller = createCaller(dailyReportRouter, ENGINEER);

    const res = await caller.listReports({ projectId: "p-1", status: "submitted" });
    expect(anyDb.dailyReport.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      status: { in: ["submitted", "checked"] },
    });
    // Legacy "checked" rows surface as "submitted" to the client.
    expect(res.reports.map((r: any) => r.status)).toEqual(["submitted", "submitted"]);
  });

  it("maps the draft filter onto [draft, rejected] and normalizes rejected→draft", async () => {
    member("engineer");
    anyDb.dailyReport.findMany.mockResolvedValue([{ id: "a", status: "rejected" }]);
    const caller = createCaller(dailyReportRouter, ENGINEER);

    const res = await caller.listReports({ projectId: "p-1", status: "draft" });
    expect(anyDb.dailyReport.findMany.mock.calls[0][0].where.status).toEqual({
      in: ["draft", "rejected"],
    });
    expect(res.reports[0].status).toBe("draft");
  });

  it("searches number/problems and skips the status filter for 'all'", async () => {
    member("engineer");
    anyDb.dailyReport.findMany.mockResolvedValue([]);
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await caller.listReports({ projectId: "p-1", status: "all", q: "leak" });
    const where = anyDb.dailyReport.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
    expect(where.OR).toEqual([
      { number: { contains: "leak" } },
      { problems: { contains: "leak" } },
    ]);
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(dailyReportRouter, ENGINEER);
    await expectTRPCError(caller.listReports({ projectId: "p-1" }), "FORBIDDEN");
    expect(anyDb.dailyReport.findMany).not.toHaveBeenCalled();
  });
});

// ─── getReport ──────────────────────────────────────────────────────────────
describe("dailyReport.getReport", () => {
  it("NOT_FOUNDs a missing report", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(null);
    const caller = createCaller(dailyReportRouter, ENGINEER);
    await expectTRPCError(caller.getReport({ reportId: "nope" }), "NOT_FOUND");
  });

  it("FORBIDDENs a report from a project the caller is not a member of (IDOR)", async () => {
    member(null); // membership lookup for the report's own project fails
    anyDb.dailyReport.findUnique.mockResolvedValue(report({ projectId: "p-other" }));
    const caller = createCaller(dailyReportRouter, ENGINEER);
    await expectTRPCError(caller.getReport({ reportId: "r-1" }), "FORBIDDEN");
    expect(anyDb.dailyProgram.findUnique).not.toHaveBeenCalled();
  });

  it("merges carried-over program tasks when no daily program exists", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(report());
    anyDb.dailyProgram.findUnique.mockResolvedValue(null);
    const carriedDate = new Date("2026-01-14T12:00:00.000Z");
    anyDb.dailyProgramTask.findMany.mockResolvedValue([
      { id: "t-1", boqCode: "C-1", program: { programDate: carriedDate } },
    ]);
    const caller = createCaller(dailyReportRouter, ENGINEER);

    const res = await caller.getReport({ reportId: "r-1" });
    // Carry-over lookup is scoped to THIS project + the report's date.
    expect(anyDb.dailyProgramTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          carriedOverTo: {
            some: { program: { projectId: "p-1", programDate: report().reportDate } },
          },
        },
      }),
    );
    expect(res.dailyProgram.tasks).toEqual([
      expect.objectContaining({ id: "t-1", isCarriedOver: true, carriedFromDate: carriedDate }),
    ]);
  });

  it("appends carried-over tasks after the day's own program tasks", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(report());
    anyDb.dailyProgram.findUnique.mockResolvedValue({ id: "dp-1", tasks: [{ id: "dp-t1" }] });
    anyDb.dailyProgramTask.findMany.mockResolvedValue([
      { id: "t-9", program: { programDate: new Date() } },
    ]);
    const caller = createCaller(dailyReportRouter, ENGINEER);

    const res = await caller.getReport({ reportId: "r-1" });
    expect(res.dailyProgram.tasks.map((t: any) => t.id)).toEqual(["dp-t1", "t-9"]);
    expect(res.dailyProgram.tasks[0].isCarriedOver).toBeUndefined();
    expect(res.dailyProgram.tasks[1].isCarriedOver).toBe(true);
  });
});

// ─── createReport ───────────────────────────────────────────────────────────
describe("dailyReport.createReport", () => {
  const baseInput = {
    projectId: "p-1",
    number: "DR-001",
    reportDate: "2026-01-15T12:00:00.000Z",
  };

  it("FORBIDDENs read-only roles (client/inspector)", async () => {
    member("client");
    const caller = createCaller(dailyReportRouter, ENGINEER);
    await expectTRPCError(caller.createReport(baseInput), "FORBIDDEN");
    expect(anyDb.dailyReport.create).not.toHaveBeenCalled();
  });

  it("CONFLICTs on a duplicate number within the project", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue({ id: "existing" });
    const caller = createCaller(dailyReportRouter, ENGINEER);
    await expectTRPCError(caller.createReport(baseInput), "CONFLICT");
    expect(anyDb.dailyReport.create).not.toHaveBeenCalled();
  });

  it("normalizes a YYYY-MM-DD reportDate to UTC midnight and derives dayOfWeek", async () => {
    member("engineer");
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await caller.createReport({ ...baseInput, reportDate: "2026-01-15" });
    const data = anyDb.dailyReport.create.mock.calls[0][0].data;
    expect(data.reportDate.getTime()).toBe(Date.UTC(2026, 0, 15));
    expect(data.dayOfWeek).toBe(
      new Date(Date.UTC(2026, 0, 15)).toLocaleDateString("en-US", { weekday: "long" }),
    );
    expect(data.createdById).toBe("eng-1");
    expect(data.projectId).toBe("p-1");
  });

  it("rejects a malformed reportDate (zod datetime)", async () => {
    member("engineer");
    const caller = createCaller(dailyReportRouter, ENGINEER);
    await expectTRPCError(
      caller.createReport({ ...baseInput, reportDate: "15/01/2026" }),
      "BAD_REQUEST",
    );
    expect(anyDb.dailyReport.create).not.toHaveBeenCalled();
  });

  it("passes materialConsumed through to the normalized-tables sync (regression)", async () => {
    member("engineer");
    anyDb.dailyReport.create.mockResolvedValue({ id: "r-9", number: "DR-001" });
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await caller.createReport({
      ...baseInput,
      materialConsumed: JSON.stringify([
        { materialId: "m-1", name: "Cement", quantity: 12, unit: "bags" },
      ]),
    });
    // The create schema used to omit materialConsumed, so the sync always
    // received undefined and the consumed table was silently empty.
    expect(anyDb.dailyReportMaterialConsumed.deleteMany).toHaveBeenCalledWith({
      where: { reportId: "r-9" },
    });
    expect(anyDb.dailyReportMaterialConsumed.createMany).toHaveBeenCalledWith({
      data: [
        {
          reportId: "r-9",
          materialId: "m-1",
          name: "Cement",
          quantity: 12,
          unit: "bags",
          sortOrder: 0,
        },
      ],
    });
  });
});

// ─── updateReport: field edits + status machine ────────────────────────────
describe("dailyReport.updateReport (fields & status machine)", () => {
  it("applies field edits to a draft report", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockImplementation(async (args: any) =>
      args.select?.createdById
        ? { createdById: "someone-else", number: "DR-001", reportDate: new Date() }
        : report(),
    );
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await caller.updateReport({ reportId: "r-1", problems: "Water seepage" });
    expect(anyDb.dailyReport.update.mock.calls[0][0].data.problems).toBe("Water seepage");
  });

  it("ignores field edits for non-draft reports (status-only updates)", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockImplementation(async (args: any) =>
      args.select?.createdById
        ? { createdById: "someone-else", number: "DR-001", reportDate: new Date() }
        : report({ status: "submitted" }),
    );
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await caller.updateReport({ reportId: "r-1", problems: "Sneaky edit" });
    expect(anyDb.dailyReport.update.mock.calls[0][0].data.problems).toBeUndefined();
  });

  it("rejects draft→submitted by a plain engineer (admin-only transition)", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(report());
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await expectTRPCError(
      caller.updateReport({ reportId: "r-1", status: "submitted" }),
      "BAD_REQUEST",
    );
    expect(anyDb.dailyReport.update).not.toHaveBeenCalled();
  });

  it("PM draft→submitted stamps preparedAt/submittedAt/submittedById and runs submission side effects", async () => {
    member("project_manager");
    anyDb.dailyReport.findUnique.mockImplementation(async (args: any) => {
      if (args.select?.createdById)
        return { createdById: "someone-else", number: "DR-001", reportDate: new Date() };
      if (args.include?.workProgress)
        return report({ status: "submitted", workProgress: [], materialConsumed: [] });
      return report();
    });
    const caller = createCaller(dailyReportRouter, PM);

    await caller.updateReport({ reportId: "r-1", status: "submitted" });
    // Engine CAS contract: updateMany claims the draft status
    const call = anyDb.dailyReport.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "r-1", status: "draft" });
    const data = call.data;
    expect(data.status).toBe("submitted");
    expect(data.submittedAt).toBeInstanceOf(Date); // stamped by the engine
    expect(data.preparedAt).toBeInstanceOf(Date);
    expect(data.submittedById).toBe("pm-1"); // stamped by the engine
    // processReportSubmission ran (its report fetch includes workProgress).
    const subCall = anyDb.dailyReport.findUnique.mock.calls.find(
      (c: any[]) => c[0]?.include?.workProgress,
    );
    expect(subCall).toBeTruthy();
  });

  it("rejects transitions outside the whitelist (draft→approved)", async () => {
    member("project_manager");
    anyDb.dailyReport.findUnique.mockResolvedValue(report());
    const caller = createCaller(dailyReportRouter, PM);

    await expectTRPCError(
      caller.updateReport({ reportId: "r-1", status: "approved" }),
      "BAD_REQUEST",
    );
    expect(anyDb.dailyReport.update).not.toHaveBeenCalled();
    expect(anyDb.dailyReport.updateMany).not.toHaveBeenCalled();
  });

  it("allows the PM to revert approved→submitted (rework loop)", async () => {
    member("project_manager");
    anyDb.dailyReport.findUnique.mockImplementation(async (args: any) =>
      args.select?.createdById
        ? { createdById: "someone-else", number: "DR-001", reportDate: new Date() }
        : report({ status: "approved" }),
    );
    const caller = createCaller(dailyReportRouter, PM);

    await caller.updateReport({ reportId: "r-1", status: "submitted" });
    const call = anyDb.dailyReport.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "r-1", status: "approved" });
    expect(call.data.status).toBe("submitted");
  });

  it("approved→archived stamps archivedAt", async () => {
    member("project_manager");
    anyDb.dailyReport.findUnique.mockImplementation(async (args: any) =>
      args.select?.createdById
        ? { createdById: "someone-else", number: "DR-001", reportDate: new Date() }
        : report({ status: "approved" }),
    );
    const caller = createCaller(dailyReportRouter, PM);

    await caller.updateReport({ reportId: "r-1", status: "archived" });
    const call = anyDb.dailyReport.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "r-1", status: "approved" });
    expect(call.data.archivedAt).toBeInstanceOf(Date);
  });

  it("FORBIDDENs updates on a report from a foreign project (IDOR)", async () => {
    member(null);
    anyDb.dailyReport.findUnique.mockResolvedValue(report({ projectId: "p-other" }));
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await expectTRPCError(
      caller.updateReport({ reportId: "r-1", problems: "x" }),
      "FORBIDDEN",
    );
    expect(anyDb.dailyReport.update).not.toHaveBeenCalled();
  });

  it("FORBIDDENs read-only roles from updating", async () => {
    member("client");
    anyDb.dailyReport.findUnique.mockResolvedValue(report());
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await expectTRPCError(
      caller.updateReport({ reportId: "r-1", problems: "x" }),
      "FORBIDDEN",
    );
    expect(anyDb.dailyReport.update).not.toHaveBeenCalled();
  });
});

// ─── updateReport: approval inventory deduction ─────────────────────────────
describe("dailyReport.updateReport (approval inventory deduction)", () => {
  /** findUnique dispatch: select-based → report row; include-based → full row. */
  function lookup(reportRow: any, fullRow: any) {
    anyDb.dailyReport.findUnique.mockImplementation(async (args: any) => {
      if (args.include?.materialConsumed || args.include?.workProgress) return fullRow;
      if (args.select?.createdById)
        return { createdById: "someone-else", number: reportRow.number, reportDate: new Date() };
      return reportRow;
    });
  }

  function approveSetup() {
    member("project_manager");
    const reportRow = report({ status: "submitted" });
    const fullRow = {
      ...reportRow,
      materialConsumed: [{ materialId: "m-1", name: "Cement", quantity: 20, unit: "bags" }],
      workProgress: [],
    };
    lookup(reportRow, fullRow);
    return { reportRow, fullRow };
  }

  it("deducts manual consumption once, at the latest receive rate, and decrements stock", async () => {
    const { reportRow } = approveSetup();
    // First findFirst = idempotency probe (has `remarks`), second = last receive rate.
    anyDb.materialTransaction.findFirst.mockImplementation(async ({ where }: any) =>
      where.remarks ? null : { rate: 750 },
    );
    anyDb.$transaction.mockImplementation(async (fn: any) => fn(anyDb));
    anyDb.material.findUnique.mockResolvedValue({ id: "m-1", unit: "bags", currentStock: 50 });
    const caller = createCaller(dailyReportRouter, PM);

    await caller.updateReport({ reportId: "r-1", status: "approved" });

    // Engine CAS contract: updateMany claims the pre-approve (submitted) status
    const updateCall = anyDb.dailyReport.updateMany.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "r-1", status: "submitted" });
    expect(updateCall.data.status).toBe("approved");
    expect(updateCall.data.approvedAt).toBeInstanceOf(Date); // stamped by the engine
    expect(updateCall.data.clientApprovedAt).toBeInstanceOf(Date);
    expect(updateCall.data.clientApprovedById).toBe("pm-1");

    const txn = anyDb.materialTransaction.create.mock.calls[0][0].data;
    expect(txn).toEqual(
      expect.objectContaining({
        materialId: "m-1",
        projectId: "p-1",
        type: "issue",
        quantity: 20,
        unit: "bags",
        rate: 750,
        reference: reportRow.number,
        paymentType: "payable",
      }),
    );
    expect(txn.remarks).toContain("Auto-deducted from Daily Report DR-001");
    // H-12 FIX: the deduction is an atomic floored raw UPDATE now.
    const dec = anyDb.$executeRaw.mock.calls.find((c: any[]) => c[0].join("?").includes('UPDATE "Material"'));
    expect(dec).toBeDefined();
    expect(dec[0].join("?")).toContain("GREATEST");
    expect(dec.slice(1)).toContain("m-1");
    expect(dec.slice(1)).toContain(20); // 50 − 20
  });

  it("clamps the resulting stock at zero (never negative)", async () => {
    approveSetup();
    anyDb.materialTransaction.findFirst.mockImplementation(async ({ where }: any) =>
      where.remarks ? null : null,
    );
    anyDb.$transaction.mockImplementation(async (fn: any) => fn(anyDb));
    anyDb.material.findUnique.mockResolvedValue({ id: "m-1", unit: "bags", currentStock: 5 });
    const caller = createCaller(dailyReportRouter, PM);

    await caller.updateReport({ reportId: "r-1", status: "approved" });
    // The issue transaction records the FULL consumed qty…
    expect(anyDb.materialTransaction.create.mock.calls[0][0].data.quantity).toBe(20);
    // …but the stock column floors at 0 (GREATEST in the atomic UPDATE).
    const dec = anyDb.$executeRaw.mock.calls.find((c: any[]) => c[0].join("?").includes('UPDATE "Material"'));
    expect(dec).toBeDefined();
    expect(dec[0].join("?")).toContain("GREATEST");
  });

  it("does NOT deduct again when re-approving after a revert (idempotency guard)", async () => {
    approveSetup();
    // The idempotency probe finds an existing auto-deduction for this report.
    anyDb.materialTransaction.findFirst.mockImplementation(async ({ where }: any) =>
      where.remarks ? { id: "existing-txn" } : { rate: 750 },
    );
    const caller = createCaller(dailyReportRouter, PM);

    await caller.updateReport({ reportId: "r-1", status: "approved" });
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();
    expect(anyDb.material.update).not.toHaveBeenCalled();
  });

  it("CONFLICTs when a concurrent approval wins the race — no double deduction (CAS regression)", async () => {
    approveSetup();
    // engine CAS matches 0 rows → another approver already transitioned the
    // report; the material deduction block below must never run.
    anyDb.dailyReport.updateMany.mockResolvedValue({ count: 0 });
    const caller = createCaller(dailyReportRouter, PM);

    await expectTRPCError(
      caller.updateReport({ reportId: "r-1", status: "approved" }),
      "CONFLICT",
    );
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();
    expect(anyDb.material.update).not.toHaveBeenCalled();
  });

  it("derives theoretical consumption from workProgress × BOQ ingredients when no manual rows", async () => {
    member("project_manager");
    const reportRow = report({ status: "submitted" });
    const fullRow = {
      ...reportRow,
      materialConsumed: [],
      workProgress: [{ boqCode: "C-100", actualQty: 10 }],
    };
    lookup(reportRow, fullRow);
    anyDb.materialTransaction.findFirst.mockImplementation(async ({ where }: any) =>
      where.remarks ? null : null, // no prior deductions, no receive rate
    );
    anyDb.boqItem.findFirst.mockResolvedValue({
      id: "b-1",
      code: "C-100",
      ingredients: [{ type: "material", name: "cement", quantity: 2, rate: 0 }],
    });
    anyDb.material.findFirst.mockResolvedValue({ id: "m-1", name: "Cement", unit: "bags" });
    anyDb.$transaction.mockImplementation(async (fn: any) => fn(anyDb));
    anyDb.material.findUnique.mockResolvedValue({ id: "m-1", unit: "bags", currentStock: 100 });
    const caller = createCaller(dailyReportRouter, PM);

    await caller.updateReport({ reportId: "r-1", status: "approved" });
    const txn = anyDb.materialTransaction.create.mock.calls[0][0].data;
    // 10 qty × 2 bags/qty, matched case-insensitively by ingredient name.
    expect(txn.materialId).toBe("m-1");
    expect(txn.quantity).toBe(20);
    // BOQ lookup was scoped to the report's project.
    expect(anyDb.boqItem.findFirst.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      code: "C-100",
    });
  });

  it("blocks approval/submit transitions while the fiscal year is locked (regression)", async () => {
    approveSetup();
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2082-83" });
    const caller = createCaller(dailyReportRouter, PM);

    await expectTRPCError(
      caller.updateReport({ reportId: "r-1", status: "approved" }),
      "FORBIDDEN",
    );
    // No partial state: the report row itself must not flip to approved.
    expect(anyDb.dailyReport.update).not.toHaveBeenCalled();
    expect(anyDb.materialTransaction.create).not.toHaveBeenCalled();

    member("project_manager");
    anyDb.dailyReport.findUnique.mockResolvedValue(report()); // draft
    await expectTRPCError(
      caller.updateReport({ reportId: "r-1", status: "submitted" }),
      "FORBIDDEN",
    );
  });
});

// ─── deleteReport ───────────────────────────────────────────────────────────
describe("dailyReport.deleteReport", () => {
  it("lets the author delete their own draft and cleans up stored attachments", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(report({ createdById: "eng-1" }));
    anyDb.dailyReportAttachment.findMany.mockResolvedValue([
      { storageUrl: "/api/files/att-1" },
      { storageUrl: "" },
    ]);
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await caller.deleteReport({ reportId: "r-1" });
    // Only attachments with a stored file are deleted from storage.
    expect(vi.mocked(deleteFile)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deleteFile)).toHaveBeenCalledWith("/api/files/att-1");
    expect(anyDb.dailyReport.delete).toHaveBeenCalledWith({ where: { id: "r-1" } });
  });

  it("non-admin authors can only delete drafts", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(
      report({ createdById: "eng-1", status: "submitted" }),
    );
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await expectTRPCError(caller.deleteReport({ reportId: "r-1" }), "BAD_REQUEST");
    expect(anyDb.dailyReport.delete).not.toHaveBeenCalled();
  });

  it("a PM can delete a submitted report", async () => {
    member("project_manager");
    anyDb.dailyReport.findUnique.mockResolvedValue(
      report({ createdById: "eng-1", status: "submitted" }),
    );
    const caller = createCaller(dailyReportRouter, PM);

    await caller.deleteReport({ reportId: "r-1" });
    expect(anyDb.dailyReport.delete).toHaveBeenCalledWith({ where: { id: "r-1" } });
  });

  it("FORBIDDENs deleting a report from a foreign project (IDOR)", async () => {
    member(null);
    anyDb.dailyReport.findUnique.mockResolvedValue(report({ projectId: "p-other" }));
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await expectTRPCError(caller.deleteReport({ reportId: "r-1" }), "FORBIDDEN");
    expect(anyDb.dailyReport.delete).not.toHaveBeenCalled();
  });
});

// ─── emailReport ────────────────────────────────────────────────────────────
describe("dailyReport.emailReport", () => {
  function emailedReport() {
    return {
      ...report({ status: "approved" }),
      project: { name: "Koteshwor <Bridge>", code: "P-01" },
      createdBy: { name: "Ram Bahadur" },
    };
  }

  it("sends to every recipient and reports counts", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(emailedReport());
    const caller = createCaller(dailyReportRouter, ENGINEER);

    const res = await caller.emailReport({
      reportId: "r-1",
      to: ["a@example.com", "b@example.com"],
    });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ sent: true, recipientCount: 2, failedRecipients: [] });
  });

  it("returns partial success when only some recipients fail", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(emailedReport());
    vi.mocked(sendEmail)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(false as never);
    const caller = createCaller(dailyReportRouter, ENGINEER);

    const res = await caller.emailReport({
      reportId: "r-1",
      to: ["a@example.com", "b@example.com"],
    });
    expect(res.sent).toBe(true);
    expect(res.failedRecipients).toEqual(["b@example.com"]);
  });

  it("surfaces an error when ALL recipients fail", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(emailedReport());
    vi.mocked(sendEmail).mockResolvedValue(false as never);
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await expectTRPCError(
      caller.emailReport({ reportId: "r-1", to: "a@example.com" }),
      "INTERNAL_SERVER_ERROR",
    );
  });

  it("escapes untrusted project/report fields in the HTML body (XSS)", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(emailedReport());
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await caller.emailReport({ reportId: "r-1", to: "a@example.com", message: "<script>x</script>" });
    const html = vi.mocked(sendEmail).mock.calls[0][0].html;
    expect(html).toContain("Koteshwor &lt;Bridge&gt;");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<Bridge>");
  });

  it("FORBIDDENs emailing a report from a foreign project (IDOR)", async () => {
    member(null);
    anyDb.dailyReport.findUnique.mockResolvedValue({
      ...emailedReport(),
      projectId: "p-other",
    });
    const caller = createCaller(dailyReportRouter, ENGINEER);

    await expectTRPCError(
      caller.emailReport({ reportId: "r-1", to: "a@example.com" }),
      "FORBIDDEN",
    );
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a missing report", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(null);
    const caller = createCaller(dailyReportRouter, ENGINEER);
    await expectTRPCError(
      caller.emailReport({ reportId: "nope", to: "a@example.com" }),
      "NOT_FOUND",
    );
  });
});
