/**
 * Router-layer tests for leave.ts (leave requests + balances) —
 * person grain with org-grain balances (ADR-0005).
 *
 * Pins:
 *   - list: org scoping (projectId in where) + status filter passthrough
 *   - get: IDOR guard — a leave belonging to another project is FORBIDDEN
 *     (HR PII does not leak cross-tenant)
 *   - create: totalDays is INCLUSIVE of both start and end (same day = 1);
 *     end-before-start rejected; read-only callers blocked; the person must
 *     have an ACTIVE assignment on the project (cross-project guard)
 *   - approve/reject: PM/coordinator-only (engineer FORBIDDEN); only
 *     PENDING requests can transition; approve updates the ORG-GRAIN
 *     LeaveBalance (taken += days, remaining -= days, current year); reject
 *     persists the rejection reason and leaves balances untouched
 *   - getBalances: scoped to person+year (org grain), defaults to current
 *   - updateBalances: admin-only; remaining recomputed as allowed − taken;
 *     negative allowances rejected
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError, orgPolicyFixture } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { leaveRouter } from "../leave";

const anyDb = db as any;
const ENGINEER = buildUser();
const PM = buildUser({ id: "pm-1" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function pendingLeave(overrides: Record<string, unknown> = {}) {
  return {
    id: "lv-1",
    projectId: "p-1",
    personId: "per-1",
    leaveType: "casual",
    status: "pending",
    totalDays: 3,
    // Org-grain balances derive the org from the requesting project.
    project: { organizationId: "org-1" },
    // Engine attribution fields — transitionEntityState writes these only
    // when the entity actually carries the columns.
    approvedById: null,
    approvedAt: null,
    rejectionReason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // capabilityGuard (leave approve/reject ride typed engine actions from
  // Phase F) resolves the caller's org policy — fail-loud on a missing org.
  anyDb.organization.findUnique.mockResolvedValue(orgPolicyFixture());
});

// ─── list ───────────────────────────────────────────────────────────────────
describe("leave.list", () => {
  it("scopes to the project and passes the status filter through", async () => {
    member("engineer");
    anyDb.leaveRequest.findMany.mockResolvedValue([]);
    const caller = createCaller(leaveRouter, ENGINEER);

    await caller.list({ projectId: "p-1" });
    expect(anyDb.leaveRequest.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });

    await caller.list({ projectId: "p-1", status: "approved" });
    expect(anyDb.leaveRequest.findMany.mock.calls[1][0].where).toEqual({
      projectId: "p-1",
      status: "approved",
    });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(leaveRouter, ENGINEER);
    await expectTRPCError(caller.list({ projectId: "p-1" }), "FORBIDDEN");
    expect(anyDb.leaveRequest.findMany).not.toHaveBeenCalled();
  });
});

// ─── get ────────────────────────────────────────────────────────────────────
describe("leave.get", () => {
  it("returns the leave with person/approver includes for project members", async () => {
    member("engineer");
    anyDb.leaveRequest.findUnique.mockResolvedValue(pendingLeave());
    const caller = createCaller(leaveRouter, ENGINEER);
    const res = await caller.get({ id: "lv-1" });
    expect(res.leave).toBeTruthy();
    expect(anyDb.leaveRequest.findUnique).toHaveBeenCalledTimes(2); // scope check + includes
  });

  it("NOT_FOUNDs unknown ids", async () => {
    member("engineer");
    anyDb.leaveRequest.findUnique.mockResolvedValue(null);
    const caller = createCaller(leaveRouter, ENGINEER);
    await expectTRPCError(caller.get({ id: "nope" }), "NOT_FOUND");
  });

  it("FORBIDDENs a leave belonging to ANOTHER project (IDOR / PII leak guard)", async () => {
    anyDb.leaveRequest.findUnique.mockResolvedValue(pendingLeave({ projectId: "p-2" }));
    member(null); // caller has no membership in p-2
    const caller = createCaller(leaveRouter, ENGINEER);
    await expectTRPCError(caller.get({ id: "lv-1" }), "FORBIDDEN");
    // the include-refetch (which returns the PII payload) must never run
    expect(anyDb.leaveRequest.findUnique).toHaveBeenCalledTimes(1);
  });
});

// ─── create ─────────────────────────────────────────────────────────────────
describe("leave.create", () => {
  const baseInput = {
    projectId: "p-1",
    personId: "per-1",
    startDate: "2026-08-01",
    endDate: "2026-08-03",
    reason: "Dashain",
  };

  it("computes totalDays INCLUSIVE of both start and end dates", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findFirst.mockResolvedValue({ id: "a-1" });
    const caller = createCaller(leaveRouter, ENGINEER);
    await caller.create(baseInput);

    const data = anyDb.leaveRequest.create.mock.calls[0][0].data;
    expect(data.totalDays).toBe(3);
    expect(data.startDate).toEqual(new Date("2026-08-01"));
    expect(data.endDate).toEqual(new Date("2026-08-03"));
    expect(data.status).toBeUndefined(); // DB default: pending
    expect(data.createdById).toBe(ENGINEER.id);
    expect(data.leaveType).toBe("casual"); // zod default
    expect(data.personId).toBe("per-1");
  });

  it("same-day leave counts as exactly 1 day", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findFirst.mockResolvedValue({ id: "a-1" });
    const caller = createCaller(leaveRouter, ENGINEER);
    await caller.create({ ...baseInput, endDate: "2026-08-01" });
    expect(anyDb.leaveRequest.create.mock.calls[0][0].data.totalDays).toBe(1);
  });

  it("BAD_REQUESTs an end date before the start date", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findFirst.mockResolvedValue({ id: "a-1" });
    const caller = createCaller(leaveRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ ...baseInput, endDate: "2026-07-30" }),
      "BAD_REQUEST",
    );
    expect(anyDb.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs callers with no project membership", async () => {
    member(null);
    const caller = createCaller(leaveRouter, ENGINEER);
    await expectTRPCError(caller.create(baseInput), "FORBIDDEN");
    expect(anyDb.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs persons without an ACTIVE assignment on the project (cross-project guard)", async () => {
    member("engineer");
    anyDb.projectStaffAssignment.findFirst.mockResolvedValue(null); // "foreign" person not on p-1
    const caller = createCaller(leaveRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ ...baseInput, personId: "foreign" }),
      "NOT_FOUND",
    );
    expect(anyDb.leaveRequest.create).not.toHaveBeenCalled();
  });
});

// ─── approve ────────────────────────────────────────────────────────────────
describe("leave.approve", () => {
  it("approves a pending leave and moves the ORG-GRAIN balance for the CURRENT year", async () => {
    member("project_manager");
    anyDb.leaveRequest.findUnique.mockResolvedValue(
      pendingLeave({ leaveType: "sick", totalDays: 3 }),
    );
    const caller = createCaller(leaveRouter, PM);
    await caller.approve({ id: "lv-1" });

    // Engine CAS contract: compare-and-swap on the status that was read +
    // validated, with attribution filled by the state machine.
    expect(anyDb.leaveRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "lv-1", status: "pending" },
      data: expect.objectContaining({
        status: "approved",
        approvedById: PM.id,
        approvedAt: expect.any(Date),
      }),
    });

    const upsert = anyDb.leaveBalance.upsert.mock.calls[0][0];
    expect(upsert.where.organizationId_personId_leaveType_year).toEqual({
      organizationId: "org-1", // derived from the requesting project's org
      personId: "per-1",
      leaveType: "sick",
      year: new Date().getFullYear(),
    });
    expect(upsert.update).toEqual({
      taken: { increment: 3 },
      remaining: { decrement: 3 },
    });
    // when no balance row exists yet it is created with taken=3, remaining=-3
    expect(upsert.create).toMatchObject({
      organizationId: "org-1",
      personId: "per-1",
      totalAllowed: 0,
      taken: 3,
      remaining: -3,
    });
  });

  it("FORBIDDENs engineers — approval is PM/coordinator only", async () => {
    member("engineer");
    anyDb.leaveRequest.findUnique.mockResolvedValue(pendingLeave());
    const caller = createCaller(leaveRouter, ENGINEER);
    await expectTRPCError(caller.approve({ id: "lv-1" }), "FORBIDDEN");
    expect(anyDb.leaveRequest.updateMany).not.toHaveBeenCalled();
    expect(anyDb.leaveBalance.upsert).not.toHaveBeenCalled();
  });

  it("allows coordinators (admin-tier)", async () => {
    member("coordinator");
    anyDb.leaveRequest.findUnique.mockResolvedValue(pendingLeave());
    const caller = createCaller(leaveRouter, ENGINEER);
    await caller.approve({ id: "lv-1" });
    expect(anyDb.leaveRequest.updateMany).toHaveBeenCalled();
  });

  it("BAD_REQUESTs approving a non-pending (already approved) request", async () => {
    member("project_manager");
    anyDb.leaveRequest.findUnique.mockResolvedValue(pendingLeave({ status: "approved" }));
    const caller = createCaller(leaveRouter, PM);
    await expectTRPCError(caller.approve({ id: "lv-1" }), "BAD_REQUEST");
    expect(anyDb.leaveRequest.updateMany).not.toHaveBeenCalled();
    expect(anyDb.leaveBalance.upsert).not.toHaveBeenCalled();
  });

  it("CONFLICTs when a concurrent approval wins the race (CAS regression)", async () => {
    member("project_manager");
    anyDb.leaveRequest.findUnique.mockResolvedValue(pendingLeave());
    // 0 rows matched → another approver already transitioned the request
    anyDb.leaveRequest.updateMany.mockResolvedValue({ count: 0 });
    const caller = createCaller(leaveRouter, PM);
    await expectTRPCError(caller.approve({ id: "lv-1" }), "CONFLICT");
    // the balance upsert must NOT run when the transition lost the race
    expect(anyDb.leaveBalance.upsert).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs unknown ids and FORBIDDENs cross-project leaves", async () => {
    member("project_manager");
    anyDb.leaveRequest.findUnique.mockResolvedValue(null);
    const caller = createCaller(leaveRouter, PM);
    await expectTRPCError(caller.approve({ id: "nope" }), "NOT_FOUND");

    anyDb.leaveRequest.findUnique.mockResolvedValue(pendingLeave({ projectId: "p-2" }));
    member(null);
    await expectTRPCError(caller.approve({ id: "lv-1" }), "FORBIDDEN");
    expect(anyDb.leaveRequest.updateMany).not.toHaveBeenCalled();
  });
});

// ─── reject ─────────────────────────────────────────────────────────────────
describe("leave.reject", () => {
  it("rejects a pending leave with a reason and does NOT touch balances", async () => {
    member("project_manager");
    anyDb.leaveRequest.findUnique.mockResolvedValue(pendingLeave());
    const caller = createCaller(leaveRouter, PM);
    await caller.reject({ id: "lv-1", rejectionReason: "Peak construction season" });

    expect(anyDb.leaveRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "lv-1", status: "pending" },
      data: expect.objectContaining({
        status: "rejected",
        rejectionReason: "Peak construction season",
      }),
    });
    expect(anyDb.leaveBalance.upsert).not.toHaveBeenCalled();
  });

  it("BAD_REQUESTs rejecting a non-pending request", async () => {
    member("project_manager");
    anyDb.leaveRequest.findUnique.mockResolvedValue(pendingLeave({ status: "rejected" }));
    const caller = createCaller(leaveRouter, PM);
    await expectTRPCError(caller.reject({ id: "lv-1" }), "BAD_REQUEST");
    expect(anyDb.leaveRequest.updateMany).not.toHaveBeenCalled();
  });

  it("FORBIDDENs engineers", async () => {
    member("engineer");
    anyDb.leaveRequest.findUnique.mockResolvedValue(pendingLeave());
    const caller = createCaller(leaveRouter, ENGINEER);
    await expectTRPCError(caller.reject({ id: "lv-1" }), "FORBIDDEN");
    expect(anyDb.leaveRequest.updateMany).not.toHaveBeenCalled();
  });
});

// ─── getBalances / updateBalances ───────────────────────────────────────────
describe("leave balances", () => {
  it("getBalances scopes to person+year (org grain) and defaults to the current year", async () => {
    member("engineer");
    anyDb.leaveBalance.findMany.mockResolvedValue([]);
    const caller = createCaller(leaveRouter, ENGINEER);

    await caller.getBalances({ projectId: "p-1", personId: "per-1" });
    expect(anyDb.leaveBalance.findMany.mock.calls[0][0].where).toEqual({
      personId: "per-1",
      year: new Date().getFullYear(),
    });

    await caller.getBalances({ projectId: "p-1", personId: "per-1", year: 2025 });
    expect(anyDb.leaveBalance.findMany.mock.calls[1][0].where.year).toBe(2025);
  });

  it("updateBalances recomputes remaining as totalAllowed − taken (update branch)", async () => {
    member("project_manager");
    anyDb.leaveBalance.findUnique.mockResolvedValue({ taken: 3 });
    const caller = createCaller(leaveRouter, PM);
    await caller.updateBalances({
      projectId: "p-1",
      personId: "per-1",
      leaveType: "casual",
      year: 2026,
      totalAllowed: 12,
    });

    const upsert = anyDb.leaveBalance.upsert.mock.calls[0][0];
    expect(upsert.where.organizationId_personId_leaveType_year).toEqual({
      organizationId: PM.organizationId,
      personId: "per-1",
      leaveType: "casual",
      year: 2026,
    });
    expect(upsert.update).toEqual({ totalAllowed: 12, remaining: 9 }); // 12 − 3 taken
    expect(upsert.create).toMatchObject({ totalAllowed: 12, taken: 0, remaining: 12 });
  });

  it("updateBalances creates the balance row when none exists", async () => {
    member("project_manager");
    anyDb.leaveBalance.findUnique.mockResolvedValue(null);
    const caller = createCaller(leaveRouter, PM);
    await caller.updateBalances({
      projectId: "p-1",
      personId: "per-1",
      leaveType: "sick",
      year: 2026,
      totalAllowed: 15,
    });
    const upsert = anyDb.leaveBalance.upsert.mock.calls[0][0];
    expect(upsert.create).toEqual({
      organizationId: PM.organizationId,
      personId: "per-1",
      leaveType: "sick",
      year: 2026,
      totalAllowed: 15,
      taken: 0,
      remaining: 15,
    });
  });

  it("updateBalances is admin-only and rejects negative allowances", async () => {
    member("engineer");
    const caller = createCaller(leaveRouter, ENGINEER);
    await expectTRPCError(
      caller.updateBalances({
        projectId: "p-1", personId: "per-1", leaveType: "casual", year: 2026, totalAllowed: 5,
      }),
      "FORBIDDEN",
    );
    expect(anyDb.leaveBalance.upsert).not.toHaveBeenCalled();

    member("project_manager");
    await expectTRPCError(
      caller.updateBalances({
        projectId: "p-1", personId: "per-1", leaveType: "casual", year: 2026, totalAllowed: -1,
      }),
      "BAD_REQUEST",
    );
  });
});
