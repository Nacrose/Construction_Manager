/**
 * Background jobs — single-process timer registry for maintenance sweeps
 * and queue dispatch (the "queue" half of the outbox + queue build).
 *
 * Design:
 *  - Jobs are plain async functions registered with an interval. The runner
 *    starts them staggered (job index × 2s) after boot, catches every
 *    failure, and records lastRun/lastError/lastDuration for diagnostics.
 *  - Single-flight per process: startBackgroundJobs() is idempotent, so it
 *    is safe to call from instrumentation.ts register() on every boot.
 *  - All sweeps registered here are idempotent by construction (date- or
 *    status-derived), so overlapping ticks or multi-process deployments
 *    degrade to wasted work, never corruption.
 *
 * Builtins:
 *  - outbox.dispatch: claims pending transactional-outbox rows and delivers
 *    them to registered processors (notifications for lifecycle
 *    transitions), reaping rows stuck in `processing` from a crashed worker.
 *  - bank-guarantee.auto-expire: flips lapsed guarantees to `expired` even
 *    when nobody opens the list view (the list endpoint keeps its own
 *    inline sweep — both are idempotent).
 *  - session.cleanup: purges sessions expired more than 7 days ago and
 *    login attempts older than 30 days so the tables stay small.
 */

export type BackgroundJob = {
  name: string;
  description: string;
  intervalMs: number;
  fn: () => Promise<void> | void;
};

type JobStatus = {
  lastStartedAt?: Date;
  lastFinishedAt?: Date;
  lastDurationMs?: number;
  lastError?: string;
  runCount: number;
  errorCount: number;
};

const jobs = new Map<string, BackgroundJob & { status: JobStatus }>();
const timers = new Map<string, ReturnType<typeof setInterval>>();

/** Register (or replace) a job definition. Replacing resets its timer. */
export function registerJob(job: BackgroundJob): void {
  const existing = jobs.get(job.name);
  jobs.set(job.name, { ...job, status: existing?.status ?? { runCount: 0, errorCount: 0 } });
  // If the runner is already active, wire the (replacement) timer live.
  if (timers.has(job.name)) startTimer(job.name);
}

async function runJob(name: string): Promise<void> {
  const job = jobs.get(name);
  if (!job) return;
  const startedAt = new Date();
  job.status.lastStartedAt = startedAt;
  try {
    await job.fn();
    job.status.lastError = undefined;
  } catch (err) {
    job.status.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    job.status.errorCount += 1;
    console.warn(`[jobs] ${name} failed:`, err);
  } finally {
    const finishedAt = new Date();
    job.status.lastFinishedAt = finishedAt;
    job.status.lastDurationMs = finishedAt.getTime() - startedAt.getTime();
    job.status.runCount += 1;
  }
}

function startTimer(name: string): void {
  const job = jobs.get(name);
  if (!job) return;
  const existing = timers.get(name);
  if (existing) clearInterval(existing);
  const timer = setInterval(() => void runJob(name), job.intervalMs);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  timers.set(name, timer);
}

// ── Builtin sweeps (idempotent, date/status-derived) ───────────────────

/** Names of the builtin jobs — pinned by tests via jobStatuses(). */
export const BUILTIN_JOB_NAMES = [
  "outbox.dispatch",
  "bank-guarantee.auto-expire",
  "session.cleanup",
] as const;

/** Flip lapsed bank guarantees to expired — shared by the list endpoint
 *  (inline sweep) and this nightly job so KPIs stay honest even when
 *  nobody opens the list view. */
export async function sweepExpiredBankGuarantees(): Promise<number> {
  const { db } = await import("@/lib/db");
  const res = await db.bankGuarantee.updateMany({
    where: { status: { in: ["active", "extended"] }, expiryDate: { lt: new Date() } },
    data: { status: "expired" },
  });
  return res.count;
}

/** Purge stale auth tables: sessions expired >7 days ago (grace window
 *  keeps recently-expired sessions auditable) and login attempts >30 days. */
export async function cleanupExpiredSessions(): Promise<{ sessions: number; loginAttempts: number }> {
  const { db } = await import("@/lib/db");
  const sessionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const attemptCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: sessionCutoff } } });
  const loginAttempts = await db.loginAttempt.deleteMany({ where: { createdAt: { lt: attemptCutoff } } });
  return { sessions: sessions.count, loginAttempts: loginAttempts.count };
}

function registerBuiltinJobs(): void {
  registerJob({
    name: "outbox.dispatch",
    description: "Deliver pending transactional-outbox events (notifications) and reap stuck rows",
    intervalMs: 10_000,
    fn: async () => {
      const { reapStuckOutboxEvents, dispatchOutboxBatch } = await import("./outbox");
      await reapStuckOutboxEvents();
      await dispatchOutboxBatch();
    },
  });

  registerJob({
    name: "bank-guarantee.auto-expire",
    description: "Flip lapsed bank guarantees to expired (date-derived sweep)",
    intervalMs: 60 * 60 * 1000,
    fn: async () => {
      await sweepExpiredBankGuarantees();
    },
  });

  registerJob({
    name: "session.cleanup",
    description: "Purge sessions expired >7 days and login attempts >30 days",
    intervalMs: 24 * 60 * 60 * 1000,
    fn: async () => {
      await cleanupExpiredSessions();
    },
  });
}

let runnerStarted = false;
const startupTimeouts = new Set<ReturnType<typeof setTimeout>>();

/**
 * Start the background job runner (idempotent). Builtins are registered on
 * first start; timers are staggered by registration order so the boots
 * don't stampede the database.
 */
export function startBackgroundJobs(opts: { initialDelayMs?: number } = {}): void {
  if (runnerStarted) return;
  runnerStarted = true;
  registerBuiltinJobs();
  const initialDelayMs = opts.initialDelayMs ?? 0;
  let index = 0;
  for (const name of jobs.keys()) {
    const delay = initialDelayMs + index * 2_000;
    index += 1;
    const t = setTimeout(() => {
      startupTimeouts.delete(t);
      void runJob(name);
      startTimer(name);
    }, delay);
    if (typeof t === "object" && "unref" in t) t.unref();
    startupTimeouts.add(t);
  }
}

/** Test/diagnostic hook: stop everything (interval + staggered startup timers). */
export function stopBackgroundJobs(): void {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
  for (const t of startupTimeouts) clearTimeout(t);
  startupTimeouts.clear();
  runnerStarted = false;
}

/** Diagnostics snapshot for admin tooling. */
export function jobStatuses(): Array<{
  name: string;
  description: string;
  intervalMs: number;
  status: JobStatus;
}> {
  return Array.from(jobs.entries()).map(([name, job]) => ({
    name,
    description: job.description,
    intervalMs: job.intervalMs,
    status: { ...job.status },
  }));
}
