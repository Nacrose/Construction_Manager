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
          findUnique: vi.fn().mockResolvedValue({
            id: "exp-1",
            status: "pending",
            approvedById: null,
            approvedAt: null,
          }),
          update: vi.fn().mockImplementation(({ data }) =>
            Promise.resolve({ id: "exp-1", ...data })
          ),
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
      expect(mockDb.siteExpense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "exp-1" },
          data: expect.objectContaining({
            status: "approved",
            approvedById: "user-admin-1",
          }),
        })
      );
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

    it("captures rejection reason when transitioning to rejected", async () => {
      const mockDb: any = {
        leave: {
          findUnique: vi.fn().mockResolvedValue({
            id: "leave-1",
            status: "pending",
            rejectionReason: null,
          }),
          update: vi.fn().mockImplementation(({ data }) =>
            Promise.resolve({ id: "leave-1", ...data })
          ),
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
      expect(mockDb.leave.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "rejected",
            rejectionReason: "Insufficient remaining leave quota",
          }),
        })
      );
    });
  });
});

