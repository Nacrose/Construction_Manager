import { describe, it, expect, vi } from "vitest";
import {
  transitionEntityState,
  canTransition,
  getAllowedTransitions,
  LIFECYCLE_GRAPHS,
} from "./state-machine";

describe("Central Multi-Entity State Machine Engine", () => {
  describe("LIFECYCLE_GRAPHS & canTransition()", () => {
    it("defines valid transition rules for all supported models", () => {
      const models = Object.keys(LIFECYCLE_GRAPHS);
      expect(models).toContain("leave");
      expect(models).toContain("submittal");
      expect(models).toContain("punchItem");
      expect(models).toContain("siteExpense");
      expect(models).toContain("subcontractorBill");
      expect(models).toContain("purchaseOrder");
      expect(models).toContain("purchaseRequisition");
      expect(models).toContain("variationOrder");
      expect(models).toContain("dailyReport");
      expect(models).toContain("boqVersion");
      expect(models).toContain("payrollRun");
      expect(models).toContain("dailyProgram");
      expect(models).toContain("ipc");
      expect(models).toContain("rfi");
      expect(models).toContain("ganttVersion");
    });

    it("evaluates valid and invalid transitions correctly with canTransition()", () => {
      // Leave
      expect(canTransition("leave", "pending", "approved").allowed).toBe(true);
      expect(canTransition("leave", "pending", "rejected").allowed).toBe(true);
      expect(canTransition("leave", "approved", "pending").allowed).toBe(false);

      // Submittal multi-loop
      expect(canTransition("submittal", "draft", "submitted").allowed).toBe(true);
      expect(canTransition("submittal", "submitted", "revise_resubmit").allowed).toBe(true);
      expect(canTransition("submittal", "revise_resubmit", "submitted").allowed).toBe(true);
      expect(canTransition("submittal", "submitted", "approved").allowed).toBe(true);
      expect(canTransition("submittal", "draft", "approved").allowed).toBe(false);

      // Punch Item linear flow
      expect(canTransition("punchItem", "open", "in_progress").allowed).toBe(true);
      expect(canTransition("punchItem", "in_progress", "resolved").allowed).toBe(true);
      expect(canTransition("punchItem", "resolved", "verified").allowed).toBe(true);
      expect(canTransition("punchItem", "verified", "closed").allowed).toBe(true);
      expect(canTransition("punchItem", "open", "closed").allowed).toBe(false);
      expect(canTransition("punchItem", "closed", "open").allowed).toBe(false);

      // BOQ version: single approval edge, then frozen
      expect(canTransition("boqVersion", "draft", "approved").allowed).toBe(true);
      expect(canTransition("boqVersion", "approved", "draft").allowed).toBe(false);
      expect(canTransition("boqVersion", "approved", "approved").allowed).toBe(false);

      // Payroll run (Phase E): draft → approved → disbursed, with an exact
      // reversal edge only BEFORE disbursement — a disbursed run is terminal
      // (settlement JE + paid amounts cannot be undone through the lifecycle).
      expect(canTransition("payrollRun", "draft", "approved").allowed).toBe(true);
      expect(canTransition("payrollRun", "approved", "disbursed").allowed).toBe(true);
      expect(canTransition("payrollRun", "approved", "draft").allowed).toBe(true);
      expect(canTransition("payrollRun", "disbursed", "draft").allowed).toBe(false);
      // Out-of-order moves are rejected: cannot disburse a draft run or
      // re-approve an already disbursed one.
      expect(canTransition("payrollRun", "draft", "disbursed").allowed).toBe(false);
      expect(canTransition("payrollRun", "disbursed", "approved").allowed).toBe(false);

      // Daily program: draft → approved, then immutable
      expect(canTransition("dailyProgram", "draft", "approved").allowed).toBe(true);
      expect(canTransition("dailyProgram", "approved", "draft").allowed).toBe(false);

      // Subcontractor bill graph reconciled with the schema enum:
      // verification (submitted→verified) and dispute paths now exist.
      expect(canTransition("subcontractorBill", "submitted", "verified").allowed).toBe(true);
      expect(canTransition("subcontractorBill", "verified", "certified").allowed).toBe(true);
      expect(canTransition("subcontractorBill", "submitted", "disputed").allowed).toBe(true);
      expect(canTransition("subcontractorBill", "certified", "disputed").allowed).toBe(true);
      expect(canTransition("subcontractorBill", "disputed", "submitted").allowed).toBe(true);
      // Legacy direct certify (pre-verification bills) stays legal.
      expect(canTransition("subcontractorBill", "submitted", "certified").allowed).toBe(true);

      // IPC: certification chain with revision back-edges; certification
      // can never be skipped.
      expect(canTransition("ipc", "draft", "submitted").allowed).toBe(true);
      expect(canTransition("ipc", "submitted", "certified").allowed).toBe(true);
      expect(canTransition("ipc", "certified", "approved").allowed).toBe(true);
      expect(canTransition("ipc", "approved", "paid").allowed).toBe(true);
      expect(canTransition("ipc", "submitted", "draft").allowed).toBe(true);
      expect(canTransition("ipc", "certified", "submitted").allowed).toBe(true);
      expect(canTransition("ipc", "approved", "certified").allowed).toBe(true);
      expect(canTransition("ipc", "draft", "paid").allowed).toBe(false);
      expect(canTransition("ipc", "draft", "certified").allowed).toBe(false);
      expect(canTransition("ipc", "submitted", "paid").allowed).toBe(false);
      expect(canTransition("ipc", "paid", "draft").allowed).toBe(false);

      // RFI: review flow — submit, decide/close, terminal close.
      expect(canTransition("rfi", "draft", "submitted").allowed).toBe(true);
      expect(canTransition("rfi", "submitted", "approved").allowed).toBe(true);
      expect(canTransition("rfi", "submitted", "rejected").allowed).toBe(true);
      expect(canTransition("rfi", "submitted", "closed").allowed).toBe(true);
      expect(canTransition("rfi", "approved", "closed").allowed).toBe(true);
      expect(canTransition("rfi", "rejected", "closed").allowed).toBe(true);
      expect(canTransition("rfi", "draft", "approved").allowed).toBe(false);
      expect(canTransition("rfi", "approved", "submitted").allowed).toBe(false);
      expect(canTransition("rfi", "closed", "submitted").allowed).toBe(false);

      // Gantt version: draft → approved → archived; archived is terminal.
      // Uppercase enum values resolve against the lowercased graph nodes.
      expect(canTransition("ganttVersion", "DRAFT", "APPROVED").allowed).toBe(true);
      expect(canTransition("ganttVersion", "APPROVED", "ARCHIVED").allowed).toBe(true);
      expect(canTransition("ganttVersion", "APPROVED", "DRAFT").allowed).toBe(false);
      expect(canTransition("ganttVersion", "ARCHIVED", "APPROVED").allowed).toBe(false);

      // Daily report graph reconciled with the router: revert, reopen and
      // archive edges exist; rejected remains a legacy terminal node.
      expect(canTransition("dailyReport", "draft", "submitted").allowed).toBe(true);
      expect(canTransition("dailyReport", "submitted", "draft").allowed).toBe(true);
      expect(canTransition("dailyReport", "submitted", "approved").allowed).toBe(true);
      expect(canTransition("dailyReport", "approved", "archived").allowed).toBe(true);
      expect(canTransition("dailyReport", "approved", "submitted").allowed).toBe(true);
      expect(canTransition("dailyReport", "draft", "approved").allowed).toBe(false);
      expect(canTransition("dailyReport", "archived", "submitted").allowed).toBe(false);
      expect(canTransition("dailyReport", "rejected", "approved").allowed).toBe(false);
    });

    it("returns allowed next states using getAllowedTransitions()", () => {
      expect(getAllowedTransitions("leave", "pending")).toEqual(["approved", "rejected"]);
      expect(getAllowedTransitions("punchItem", "open")).toEqual(["in_progress"]);
      expect(getAllowedTransitions("submittal", "submitted")).toEqual([
        "approved",
        "rejected",
        "revise_resubmit",
      ]);
      expect(getAllowedTransitions("punchItem", "closed")).toEqual([]);
    });
  });

  describe("transitionEntityState() execution", () => {
    it("successfully transitions from pending to approved with attribution", async () => {
      const mockDb: any = {
        siteExpense: {
          findUnique: vi.fn()
            .mockResolvedValueOnce({
              id: "exp-1",
              status: "pending",
              approvedById: null,
              approvedAt: null,
            })
            .mockResolvedValue({ id: "exp-1", status: "approved" }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const res = await transitionEntityState(mockDb, {
        model: "siteExpense",
        id: "exp-1",
        targetState: "approved",
        userId: "user-admin-1",
        skipEventEmit: true,
      });

      expect(res.previousState).toBe("pending");
      expect(res.currentState).toBe("approved");
      // Optimistic lock: the write must compare-and-swap on the status
      // that was read, so concurrent transitions cannot double-apply.
      expect(mockDb.siteExpense.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "exp-1", status: "pending" },
          data: expect.objectContaining({
            status: "approved",
            approvedById: "user-admin-1",
          }),
        })
      );
    });

    it("throws CONFLICT when a concurrent transition wins the race", async () => {
      const mockDb: any = {
        siteExpense: {
          findUnique: vi.fn().mockResolvedValue({
            id: "exp-1",
            status: "pending",
          }),
          // 0 rows matched => another request already transitioned it
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };

      await expect(
        transitionEntityState(mockDb, {
          model: "siteExpense",
          id: "exp-1",
          targetState: "approved",
          userId: "user-admin-1",
          skipEventEmit: true,
        })
      ).rejects.toThrow(/modified by someone else/);
    });

    it("throws BAD_REQUEST when entity is not in an allowed state", async () => {
      const mockDb: any = {
        subcontractorBill: {
          findUnique: vi.fn().mockResolvedValue({
            id: "bill-1",
            status: "approved",
          }),
        },
      };

      await expect(
        transitionEntityState(mockDb, {
          model: "subcontractorBill",
          id: "bill-1",
          allowedCurrentStates: ["draft", "submitted"],
          targetState: "certified",
          userId: "user-1",
          skipEventEmit: true,
        })
      ).rejects.toThrow("Invalid state transition for subcontractorBill");
    });

    it("preserves the caller's casing for uppercase-enum models (ganttVersion)", async () => {
      const mockDb: any = {
        ganttVersion: {
          findUnique: vi.fn()
            .mockResolvedValueOnce({ id: "gv-1", status: "DRAFT" })
            .mockResolvedValue({ id: "gv-1", status: "APPROVED" }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const res = await transitionEntityState(mockDb, {
        model: "ganttVersion",
        id: "gv-1",
        targetState: "APPROVED",
        additionalData: { isActive: true },
        userId: "pm-1",
        skipEventEmit: true,
      });

      // Graph lookup lowercases, but the write must carry the caller's
      // exact casing — VersionStatus is a Prisma enum and would reject
      // a lowercase "approved".
      expect(mockDb.ganttVersion.updateMany).toHaveBeenCalledWith({
        where: { id: "gv-1", status: "DRAFT" }, // CAS matches the stored casing
        data: expect.objectContaining({ status: "APPROVED", isActive: true }),
      });
      expect(res.currentState).toBe("approved"); // informational result is normalized
    });

    it("captures rejection reason when transitioning to rejected", async () => {
      const mockDb: any = {
        leave: {
          findUnique: vi.fn()
            .mockResolvedValueOnce({
              id: "leave-1",
              status: "pending",
              rejectionReason: null,
            })
            .mockResolvedValue({ id: "leave-1", status: "rejected" }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const res = await transitionEntityState(mockDb, {
        model: "leave",
        id: "leave-1",
        targetState: "rejected",
        userId: "user-approver",
        notes: "Insufficient remaining leave quota",
        skipEventEmit: true,
      });

      expect(res.currentState).toBe("rejected");
      expect(mockDb.leave.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "leave-1", status: "pending" },
          data: expect.objectContaining({
            status: "rejected",
            rejectionReason: "Insufficient remaining leave quota",
          }),
        })
      );
    });

    it("verified transition attributes verification without re-writing resolved fields", async () => {
      const mockDb: any = {
        punchItem: {
          findUnique: vi.fn()
            .mockResolvedValueOnce({
              id: "punch-1",
              status: "resolved",
              resolvedDate: new Date("2026-01-02"),
              resolvedBy: "resolver-1",
              resolvedNotes: "Defect fixed",
              verifiedDate: null,
              verifiedBy: null,
            })
            .mockResolvedValue({ id: "punch-1", status: "verified" }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const res = await transitionEntityState(mockDb, {
        model: "punchItem",
        id: "punch-1",
        targetState: "verified",
        userId: "verifier-1",
        userName: "Verifier",
        skipEventEmit: true,
      });

      expect(res.currentState).toBe("verified");
      const claim = mockDb.punchItem.updateMany.mock.calls[0][0];
      // Attributes the verification itself…
      expect(claim.data).toMatchObject({ status: "verified", verifiedBy: "Verifier" });
      expect(claim.data.verifiedDate).toBeInstanceOf(Date);
      // …but does NOT re-write resolved*: updateMany is a partial update, so
      // they persist automatically. A copy-back of the pre-transition entity
      // (the old behavior) is a misleading no-op that would ignore caller
      // additionalData — pin that it is gone.
      expect(claim.data).not.toHaveProperty("resolvedDate");
      expect(claim.data).not.toHaveProperty("resolvedBy");
      expect(claim.data).not.toHaveProperty("resolvedNotes");
    });

    it("clears a stale rejectionReason on approve and strips engine-owned attribution from additionalData", async () => {
      const mockDb: any = {
        purchaseRequisition: {
          findUnique: vi.fn()
            .mockResolvedValueOnce({
              id: "pr-1",
              status: "submitted",
              rejectionReason: "Wrong quantity",
              approvedById: null,
              approvedAt: null,
            })
            .mockResolvedValue({ id: "pr-1", status: "approved" }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const res = await transitionEntityState(mockDb, {
        model: "purchaseRequisition",
        id: "pr-1",
        targetState: "approved",
        userId: "pm-1",
        // A caller trying to fabricate a verifier / a rejection reason via
        // additionalData must be stripped — these fields are engine-owned and
        // are set from userId/userName/notes, never from caller input.
        additionalData: { rejectionReason: "spoofed", verifiedBy: "attacker", grossAmount: 999 },
        skipEventEmit: true,
      });

      expect(res.currentState).toBe("approved");
      const claim = mockDb.purchaseRequisition.updateMany.mock.calls[0][0];
      expect(claim.data).toMatchObject({ status: "approved", approvedById: "pm-1" });
      // Approve clears the stale rejected reason (was previously smuggled via
      // additionalData) — not the caller's "spoofed" value.
      expect(claim.data.rejectionReason).toBeNull();
      // Engine-owned attribution is stripped from caller input.
      expect(claim.data).not.toHaveProperty("verifiedBy");
      // Non-reserved fields still flow through.
      expect(claim.data.grossAmount).toBe(999);
    });
  });
});

