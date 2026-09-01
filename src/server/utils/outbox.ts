/**
 * Transactional Outbox — reliable domain-event delivery.
 *
 * Problem this solves: when a lifecycle transition commits and the process
 * dies before the notification/side-effect runs, the event is lost. With
 * the outbox, the event row is INSERTed in the SAME database transaction
 * as the state change, so it commits atomically with it — and the
 * background worker delivers it afterwards, with retries and a
 * dead-letter status.
 *
 * Delivery model (at-least-once):
 *  1. Router/engine calls `enqueueOutboxEvent(db | tx, payload)` — the row
 *     commits atomically with the business write when a tx is passed.
 *  2. `dispatchOutboxBatch` claims a batch via per-row CAS
 *     (pending → processing), runs every registered processor for the
 *     event type, then marks the row done. Processor failures increment
 *     attempts and reschedule with exponential backoff; after
 *     MAX_OUTBOX_ATTEMPTS the row is parked as `failed` (dead letter) for
 *     diagnostics via the admin outboxStats endpoint.
 *  3. Concurrent workers are safe: the CAS claim means only one worker can
 *     own a row; a lost claim is a no-op.
 *
 * The default processor for `lifecycle.transitioned` fans out to the same
 * notification pipeline `emitDomainEvent` uses (notifyProject + web push),
 * moved here so engine transitions survive crashes (see state-machine.ts).
 */
import { DbTxClient } from "@/lib/db";
import { db } from "@/lib/db";
import type { DomainEventPayload } from "./domain-events";
import { deliverDomainEvent } from "./domain-events";

export const MAX_OUTBOX_ATTEMPTS = 5;

/** Payload stored in the row — the full domain event, JSON-serializable. */
export type OutboxRowPayload = DomainEventPayload;

type OutboxProcessor = (
  payload: OutboxRowPayload,
  row: { id: string; type: string; entityType: string; entityId: string; projectId: string | null; organizationId: string | null }
) => Promise<void>;

const processors = new Map<string, OutboxProcessor[]>();

/**
 * Register a consumer for an outbox event type. Multiple processors per
 * type are allowed; a failure in one does not prevent the others from
 * being attempted (each failure records its own error on the row).
 */
export function registerOutboxProcessor(type: string, fn: OutboxProcessor): void {
  const list = processors.get(type) ?? [];
  list.push(fn);
  processors.set(type, list);
}

// Builtin delivery for engine lifecycle transitions: fan out to in-app
// notifications + chat + web push — the exact pipeline emitDomainEvent
// would have run inline, now crash-safe.
registerOutboxProcessor("lifecycle.transitioned", async (payload) => {
  await deliverDomainEvent(payload);
});

/**
 * Enqueue a domain event onto the outbox. Pass the SAME db handle (tx) the
 * business write is using so the event commits atomically with it.
 */
export async function enqueueOutboxEvent(
  dbOrTx: DbTxClient,
  payload: OutboxRowPayload
): Promise<void> {
  await dbOrTx.outboxEvent.create({
    data: {
      type: payload.type,
      entityType: payload.entityType,
      entityId: payload.entityId,
      projectId: payload.projectId ?? null,
      organizationId:
        (payload.metadata?.organizationId as string | undefined) ?? null,
      payload: payload as unknown as Record<string, unknown>,
    },
  });
}

export type OutboxDispatchResult = {
  claimed: number;
  done: number;
  retried: number;
  deadLettered: number;
};

/**
 * Claim and process one batch of pending outbox events. Returns dispatch
 * counts so callers (worker loop, admin diagnostics, tests) can observe
 * progress.
 */
export async function dispatchOutboxBatch(
  opts: { batchSize?: number; now?: Date } = {}
): Promise<OutboxDispatchResult> {
  const batchSize = opts.batchSize ?? 25;
  const now = opts.now ?? new Date();

  const pending = await db.outboxEvent.findMany({
    where: { status: "pending", availableAt: { lte: now } },
    orderBy: { availableAt: "asc" },
    take: batchSize,
    select: { id: true, type: true, entityType: true, entityId: true, projectId: true, organizationId: true, payload: true, attempts: true },
  });

  const result: OutboxDispatchResult = { claimed: 0, done: 0, retried: 0, deadLettered: 0 };

  for (const row of pending) {
    // Per-row CAS claim: only this worker owns rows that flip pending →
    // processing. A concurrent worker's claim matches 0 rows and skips.
    const claim = await db.outboxEvent.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "processing" },
    });
    if (claim.count === 0) continue;
    result.claimed += 1;

    const payload = row.payload as unknown as OutboxRowPayload;
    const processorsForType = processors.get(row.type) ?? [];
    const errors: string[] = [];

    for (const processor of processorsForType) {
      try {
        await processor(payload, row);
      } catch (err) {
        errors.push(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      }
    }

    if (errors.length === 0) {
      await db.outboxEvent.updateMany({
        where: { id: row.id, status: "processing" },
        data: { status: "done", processedAt: new Date(), lastError: null },
      });
      result.done += 1;
      continue;
    }

    const attempts = row.attempts + 1;
    const message = errors.join(" | ").slice(0, 2000);
    if (attempts >= MAX_OUTBOX_ATTEMPTS) {
      // Dead letter: park for diagnostics instead of retrying forever.
      await db.outboxEvent.updateMany({
        where: { id: row.id, status: "processing" },
        data: { status: "failed", attempts, lastError: message },
      });
      result.deadLettered += 1;
    } else {
      // Exponential backoff: 15s, 60s, 135s, 240s … (15s × attempts²)
      const backoffMs = 15_000 * attempts * attempts;
      await db.outboxEvent.updateMany({
        where: { id: row.id, status: "processing" },
        data: {
          status: "pending",
          attempts,
          lastError: message,
          availableAt: new Date(Date.now() + backoffMs),
        },
      });
      result.retried += 1;
    }
  }

  return result;
}

/**
 * Recover rows stuck in `processing` (worker crashed mid-delivery after
 * claiming). Safe to run on every worker tick: rows claimed before the
 * cutoff are returned to the pending queue without burning an attempt (we
 * cannot know whether side effects already ran — at-least-once means
 * processors must be idempotent). The model has no claim timestamp, so we
 * approximate by row age: only rows older than the stale window are
 * re-queued, which bounds re-delivery delay without touching fresh rows.
 */
export async function reapStuckOutboxEvents(
  opts: { staleMs?: number; now?: Date; limit?: number } = {}
): Promise<number> {
  const staleMs = opts.staleMs ?? 5 * 60_000;
  const cutoff = new Date((opts.now ?? new Date()).getTime() - staleMs);
  const limit = opts.limit ?? 200;
  const res = await db.$executeRaw`
    UPDATE "OutboxEvent"
    SET "status" = 'pending'
    WHERE "status" = 'processing'
      AND "id" IN (
        SELECT "id" FROM "OutboxEvent"
        WHERE "status" = 'processing'
          AND "createdAt" < ${cutoff}
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
      )
  `;
  return res;
}

let workerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the outbox worker loop (single-flight per process). Reaps stuck
 * rows and dispatches pending batches on the configured interval. Safe to
 * call repeatedly — subsequent calls are no-ops.
 */
export function startOutboxWorker(opts: { intervalMs?: number } = {}): void {
  if (workerTimer) return;
  const intervalMs = opts.intervalMs ?? 10_000;
  const tick = async () => {
    try {
      await reapStuckOutboxEvents();
      await dispatchOutboxBatch();
    } catch (err) {
      console.warn("[outbox] worker tick failed:", err);
    }
  };
  workerTimer = setInterval(() => void tick(), intervalMs);
  // Do not keep the process alive purely for the worker.
  if (typeof workerTimer === "object" && "unref" in workerTimer) workerTimer.unref();
  void tick(); // immediate first pass
}

/** Test/diagnostic hook: stop the loop. */
export function stopOutboxWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
