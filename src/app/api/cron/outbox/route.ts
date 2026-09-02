import { NextResponse } from "next/server";
import {
  dispatchOutboxBatch,
  reapStuckOutboxEvents,
} from "@/server/utils/outbox";

export const dynamic = "force-dynamic";

/**
 * Outbox dispatch cron endpoint.
 *
 * WHY THIS EXISTS
 * The transactional outbox guarantees events are committed atomically with
 * the business write — but committed rows still need a DELIVERY pass. The
 * only dispatcher was `startOutboxWorker()`, an in-process setInterval
 * loop that (a) is never started anywhere and (b) would be serverless-
 * hostile anyway: Vercel functions freeze between requests, so a resident
 * timer cannot be relied on. Until now, `lifecycle.transitioned` events
 * were written to OutboxEvent and NEVER dispatched in production.
 *
 * This endpoint is the serverless-friendly delivery pass: reap rows stuck
 * in `processing` (crashed worker recovery), then claim-and-dispatch
 * pending batches until drained or the invocation budget is spent.
 * Concurrency-safe — the per-row CAS claim means overlapping invocations
 * (Vercel Cron retries, manual triggers) cannot double-deliver a row.
 *
 * Schedule: vercel.json crons (every 5 minutes). Register additional
 * event processors via registerOutboxProcessor(); this route needs no
 * changes as the processor set grows.
 *
 * SECURITY: fails CLOSED like the invariants cron — no CRON_SECRET
 * configured, no run. Processing fan-out hits the notification pipeline,
 * which must never be triggerable by an anonymous caller.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not configured. Outbox dispatch is disabled (fail-closed). Set CRON_SECRET so Vercel Cron can authenticate.",
      },
      { status: 503 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    // Recover rows claimed by a worker that died mid-delivery. Runs on
    // every tick; bounded by the stale window (5m default) and row limit.
    const reaped = await reapStuckOutboxEvents();

    // Drain pending work: loop batches until the queue reports no claims
    // or we approach the function budget (Vercel caps at 10s default for
    // hobby / configurable for pro — stay well under it).
    const MAX_BATCHES = 8;
    const BATCH_SIZE = 50;
    const totals = { claimed: 0, done: 0, retried: 0, deadLettered: 0 };
    let batches = 0;
    for (; batches < MAX_BATCHES; batches++) {
      const result = await dispatchOutboxBatch({ batchSize: BATCH_SIZE });
      totals.claimed += result.claimed;
      totals.done += result.done;
      totals.retried += result.retried;
      totals.deadLettered += result.deadLettered;
      if (result.claimed === 0) break;
      if (Date.now() - startedAt > 20_000) break; // leave headroom
    }

    return NextResponse.json({
      ok: true,
      reaped,
      batches,
      ...totals,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[cron/outbox] dispatch failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Outbox dispatch failed" },
      { status: 500 },
    );
  }
}
