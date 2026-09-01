import { describe, it, expect, vi } from "vitest";
import { transitionEntityState } from "./state-machine";

describe("Central Multi-Entity State Machine Engine", () => {
  it("successfully transitions from submitted to approved with attribution", async () => {
    const mockDb: any = {
      siteExpense: {
        findUnique: vi.fn().mockResolvedValue({
          id: "exp-1",
          status: "submitted",
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
      allowedCurrentStates: ["draft", "submitted"],
      targetState: "approved",
      userId: "user-admin-1",
      skipEventEmit: true,
    });

    expect(res.previousState).toBe("submitted");
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
        targetState: "approved",
        userId: "user-1",
        skipEventEmit: true,
      })
    ).rejects.toThrow("Invalid state transition for subcontractorBill. Current status is 'approved', but expected one of: [draft, submitted].");
  });

  it("captures rejection reason when transitioning to rejected (graph-derived from-states)", async () => {
    const mockDb: any = {
      leaveRequest: {
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
      model: "leaveRequest",
      id: "leave-1",
      // allowedCurrentStates intentionally omitted — derived from the
      // lifecycle graph (pending → rejected is a real edge).
      targetState: "rejected",
      userId: "user-approver",
      notes: "Insufficient remaining leave quota",
      skipEventEmit: true,
    });

    expect(res.currentState).toBe("rejected");
    expect(mockDb.leaveRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "rejected",
          rejectionReason: "Insufficient remaining leave quota",
        }),
      })
    );
  });

  it("rejects a graph-unknown transition when from-states are derived", async () => {
    const mockDb: any = {
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "leave-2",
          status: "draft", // "draft" is not a leaveRequest state — no graph edge to rejected
        }),
      },
    };

    await expect(
      transitionEntityState(mockDb, {
        model: "leaveRequest",
        id: "leave-2",
        targetState: "rejected",
        userId: "user-1",
        skipEventEmit: true,
      })
    ).rejects.toThrow(/Invalid state transition for leaveRequest/);
  });
});
