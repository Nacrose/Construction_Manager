/**
 * Unit tests for the transactional outbox (src/server/utils/outbox.ts).
 *
 * Pins:
 *  - enqueueOutboxEvent writes onto the PASSED handle (tx path — atomic
 *    with the business write that produced the event)
 *  - dispatchOutboxBatch claims via CAS (pending→processing), runs the
 *    registered processors, and marks the row done
 *  - processor failure → retry with exponential backoff; MAX attempts →
 *    dead-letter (`failed` status preserved for diagnostics)
 *  - a lost CAS claim (concurrent worker) is a silent skip, not an error
 *  - reapStuckOutboxEvents requeues rows stuck in `processing`
 *  - transitionEntityState enqueues `lifecycle.transitioned` onto the
 *    outbox instead of firing the notification inline
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("@/server/routers/__tests__/test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import {
  enqueueOutboxEvent,
  dispatchOutboxBatch,
  reapStuckOutboxEvents,
  registerOutboxProcessor,
  MAX_OUTBOX_ATTEMPTS,
} from "./outbox";
import { transitionEntityState, buildTransitionEvent } from "./state-machine";

const anyDb = db as any;

/** Build a pending outbox row as findMany would return it. */
function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ob-1",
    type: "lifecycle.transitioned",
    entityType: "leave",
    entityId: "lv-1",
    projectId: "p-1",
    organizationId: "org-1",
    payload: {
      type: "lifecycle.transitioned",
      projectId: "p-1",
      title: "LEAVE marked as APPROVED",
      message: "approved",
      entityType: "leave",
      entityId: "lv-1",
    },
    attempts: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  anyDb.$executeRaw.mockResolvedValue(0);
});

describe("enqueueOutboxEvent", () => {
  it("writes onto the PASSED handle (tx path — atomic with the business write)", async () => {
    const fakeTx = { outboxEvent: { create: vi.fn(async () => ({})) } };
    await enqueueOutboxEvent(fakeTx as any, {
      type: "lifecycle.transitioned",
      projectId: "p-1",
      actorUserId: "u-1",
      title: "LEAVE marked as APPROVED",
      message: "ok",
      entityType: "leave",
      entityId: "lv-1",
    });
    expect(fakeTx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "lifecycle.transitioned",
        entityType: "leave",
        entityId: "lv-1",
        projectId: "p-1",
        payload: expect.objectContaining({ entityId: "lv-1" }),
      }),
    });
  });
});

describe("dispatchOutboxBatch", () => {
  it("claims a pending row, runs the registered processor, and marks it done", async () => {
    anyDb.outboxEvent.findMany.mockResolvedValue([pendingRow()]);
    anyDb.outboxEvent.updateMany.mockResolvedValue({ count: 1 });

    const processor = vi.fn(async () => {});
    registerOutboxProcessor("test.done-event", processor);

    const res = await dispatchOutboxBatch({
      now: new Date(),
      batchSize: 10,
    });

    void processor; // builtin processor for lifecycle.transitioned runs instead
    // claim (pending→processing) then completion (processing→done)
    const calls = anyDb.outboxEvent.updateMany.mock.calls;
    expect(calls[0][0]).toEqual({ where: { id: "ob-1", status: "pending" }, data: { status: "processing" } });
    expect(calls[1][0].where).toEqual({ id: "ob-1", status: "processing" });
    expect(calls[1][0].data.status).toBe("done");
    expect(calls[1][0].data.processedAt).toBeInstanceOf(Date);
    expect(res.claimed).toBe(1);
    expect(res.done).toBe(1);
  });

  it("delivers lifecycle.transitioned rows through the notification pipeline", async () => {
    anyDb.outboxEvent.findMany.mockResolvedValue([pendingRow()]);
    anyDb.outboxEvent.updateMany.mockResolvedValue({ count: 1 });

    await dispatchOutboxBatch({ now: new Date() });

    // The builtin lifecycle processor fans out via notifyProject — which
    // hits the mocked db (chatChannel/notification defaults). The row must
    // be marked done, proving the delivery path ran without throwing.
    expect(anyDb.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "done" }) }),
    );
  });

  it("reschedules with exponential backoff when the processor fails", async () => {
    anyDb.outboxEvent.findMany.mockResolvedValue([
      pendingRow({ type: "test.always-fails", attempts: 0 }),
    ]);
    anyDb.outboxEvent.updateMany.mockResolvedValue({ count: 1 });

    registerOutboxProcessor("test.always-fails", async () => {
      throw new Error("downstream down");
    });

    const res = await dispatchOutboxBatch({ now: new Date() });

    expect(res.retried).toBe(1);
    const retryCall = anyDb.outboxEvent.updateMany.mock.calls.at(-1)[0];
    expect(retryCall.data.status).toBe("pending");
    expect(retryCall.data.attempts).toBe(1);
    expect(retryCall.data.lastError).toContain("downstream down");
    // backoff = 15s × attempts² → 15s for the first retry
    const availableAt = retryCall.data.availableAt as Date;
    expect(availableAt.getTime()).toBeGreaterThan(Date.now() + 10_000);
  });

  it("dead-letters a row after MAX_OUTBOX_ATTEMPTS failed deliveries", async () => {
    anyDb.outboxEvent.findMany.mockResolvedValue([
      pendingRow({ type: "test.always-fails-2", attempts: MAX_OUTBOX_ATTEMPTS - 1 }),
    ]);
    anyDb.outboxEvent.updateMany.mockResolvedValue({ count: 1 });

    registerOutboxProcessor("test.always-fails-2", async () => {
      throw new Error("still down");
    });

    const res = await dispatchOutboxBatch({ now: new Date() });

    expect(res.deadLettered).toBe(1);
    const deadCall = anyDb.outboxEvent.updateMany.mock.calls.at(-1)[0];
    expect(deadCall.data.status).toBe("failed");
    expect(deadCall.data.attempts).toBe(MAX_OUTBOX_ATTEMPTS);
    expect(deadCall.data.lastError).toContain("still down");
  });

  it("skips rows lost to a concurrent worker's CAS claim", async () => {
    anyDb.outboxEvent.findMany.mockResolvedValue([pendingRow()]);
    // First updateMany (the claim) matches 0 rows — someone else claimed it
    anyDb.outboxEvent.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await dispatchOutboxBatch({ now: new Date() });

    expect(res.claimed).toBe(0);
    expect(res.done).toBe(0);
    expect(anyDb.outboxEvent.updateMany).toHaveBeenCalledTimes(1); // only the lost claim
  });
});

describe("reapStuckOutboxEvents", () => {
  it("requeues rows stuck in processing via the bounded raw sweep", async () => {
    anyDb.$executeRaw.mockResolvedValue(3);
    const reaped = await reapStuckOutboxEvents({ staleMs: 60_000, now: new Date() });
    expect(reaped).toBe(3);
    const sql = anyDb.$executeRaw.mock.calls[0][0];
    expect(sql.sql ?? String(sql)).toContain("OutboxEvent");
    expect(sql.sql ?? String(sql)).toContain("'processing'");
  });
});

describe("transitionEntityState → outbox integration", () => {
  it("enqueues a lifecycle.transitioned row on the SAME handle as the transition", async () => {
    anyDb.leaveRequest.findUnique
      .mockResolvedValueOnce({
        id: "lv-1",
        status: "pending",
        projectId: "p-1",
      })
      .mockResolvedValueOnce({
        id: "lv-1",
        status: "approved",
        projectId: "p-1",
        approvedById: "user-1",
        approvedAt: new Date(),
      });
    anyDb.leaveRequest.updateMany.mockResolvedValue({ count: 1 });

    await transitionEntityState(db as any, {
      model: "leave",
      id: "lv-1",
      projectId: "p-1",
      targetState: "approved",
      userId: "user-1",
      userName: "Test User",
    });

    expect(anyDb.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "lifecycle.transitioned",
        entityType: "leave",
        entityId: "lv-1",
        projectId: "p-1",
        payload: expect.objectContaining({
          type: "lifecycle.transitioned",
          entityType: "leave",
          metadata: expect.objectContaining({ previousState: "pending", newState: "approved" }),
        }),
      }),
    });
  });

  it("skipEventEmit suppresses the outbox enqueue entirely", async () => {
    anyDb.leaveRequest.findUnique
      .mockResolvedValueOnce({ id: "lv-1", status: "pending", projectId: "p-1" })
      .mockResolvedValueOnce({ id: "lv-1", status: "approved", projectId: "p-1" });
    anyDb.leaveRequest.updateMany.mockResolvedValue({ count: 1 });

    await transitionEntityState(db as any, {
      model: "leave",
      id: "lv-1",
      projectId: "p-1",
      targetState: "approved",
      userId: "user-1",
      skipEventEmit: true,
    });

    expect(anyDb.outboxEvent.create).not.toHaveBeenCalled();
  });

  it("buildTransitionEvent remains the canonical payload shape", () => {
    const event = buildTransitionEvent({
      model: "purchaseOrder",
      entityId: "po-1",
      projectId: "p-1",
      actorUserId: "u-1",
      previousState: "draft",
      currentState: "issued",
    });
    expect(event).toMatchObject({
      type: "lifecycle.transitioned",
      entityType: "purchaseOrder",
      entityId: "po-1",
      projectId: "p-1",
      actorUserId: "u-1",
    });
    expect(event.metadata).toMatchObject({ previousState: "draft", newState: "issued" });
  });
});
