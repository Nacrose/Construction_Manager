/**
 * Unit tests for the background job runner sweeps
 * (src/server/utils/background-jobs.ts).
 *
 * Pins:
 *  - sweepExpiredBankGuarantees: flips ONLY active/extended guarantees whose
 *    expiryDate has passed (idempotent date-derived sweep, mirrors the list
 *    endpoint's inline sweep)
 *  - cleanupExpiredSessions: purges sessions expired >7 days (grace window)
 *    and login attempts older than 30 days
 *  - registerJob/jobStatuses: the diagnostics snapshot reflects registered
 *    jobs without requiring the runner to be started
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("@/server/routers/__tests__/test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import {
  sweepExpiredBankGuarantees,
  cleanupExpiredSessions,
  registerJob,
  jobStatuses,
  startBackgroundJobs,
  stopBackgroundJobs,
  BUILTIN_JOB_NAMES,
} from "./background-jobs";

const anyDb = db as any;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("sweepExpiredBankGuarantees", () => {
  it("flips only lapsed active/extended guarantees (idempotent predicate)", async () => {
    anyDb.bankGuarantee.updateMany.mockResolvedValue({ count: 4 });

    const count = await sweepExpiredBankGuarantees();

    expect(count).toBe(4);
    expect(anyDb.bankGuarantee.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["active", "extended"] },
        expiryDate: { lt: expect.any(Date) },
      },
      data: { status: "expired" },
    });
  });
});

describe("cleanupExpiredSessions", () => {
  it("purges long-expired sessions and stale login attempts with grace windows", async () => {
    anyDb.session.deleteMany.mockResolvedValue({ count: 12 });
    anyDb.loginAttempt.deleteMany.mockResolvedValue({ count: 340 });

    const res = await cleanupExpiredSessions();

    expect(res).toEqual({ sessions: 12, loginAttempts: 340 });

    // Session purge: 7-day grace window after expiry
    const sessionCall = anyDb.session.deleteMany.mock.calls[0][0];
    const sessionCutoff = (sessionCall.where.expiresAt.lt as Date).getTime();
    expect(sessionCutoff).toBeLessThan(Date.now());
    expect(Date.now() - sessionCutoff).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(Date.now() - sessionCutoff).toBeLessThan(8 * 24 * 60 * 60 * 1000);

    // Login attempt purge: 30-day retention
    const attemptCall = anyDb.loginAttempt.deleteMany.mock.calls[0][0];
    const attemptCutoff = (attemptCall.where.createdAt.lt as Date).getTime();
    expect(Date.now() - attemptCutoff).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(Date.now() - attemptCutoff).toBeLessThan(31 * 24 * 60 * 60 * 1000);
  });
});

describe("job registry diagnostics", () => {
  it("reflects registered jobs with their intervals and clean status", () => {
    registerJob({
      name: "test.noop",
      description: "noop sweep for diagnostics",
      intervalMs: 1234,
      fn: () => {},
    });

    const jobs = jobStatuses();
    const noop = jobs.find((j) => j.name === "test.noop");
    expect(noop).toBeDefined();
    expect(noop?.intervalMs).toBe(1234);
    expect(noop?.status.runCount).toBe(0);
    expect(noop?.status.errorCount).toBe(0);
  });

  it("registers the builtin jobs on runner start (without firing them)", () => {
    // Start then stop immediately: builtins register, but the staggered
    // first ticks are cleared before they can fire (no timers in tests).
    startBackgroundJobs({ initialDelayMs: 60_000 });
    stopBackgroundJobs();

    const names = jobStatuses().map((j) => j.name);
    for (const builtin of BUILTIN_JOB_NAMES) {
      expect(names).toContain(builtin);
    }
  });
});
