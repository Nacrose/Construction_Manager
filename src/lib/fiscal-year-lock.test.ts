import { describe, it, expect, vi, beforeEach } from "vitest";

// A Proxy-style mock: `db.$transaction` runs the callback with `db` itself
// (the same pattern the router tests use), so `tx.fiscalYearLock.findFirst`
// resolves against the mock. `withOrgContext` is mocked so the test can assert
// the enforcement path pins the tenant GUC transaction-scoped.
vi.mock("@/lib/db", () => {
  const db: any = { fiscalYearLock: { findFirst: vi.fn() } };
  db.$transaction = vi.fn(async (fn: any) => fn(db));
  return { db, getFreshDb: () => db };
});
vi.mock("@/lib/rls", () => ({
  withOrgContext: vi.fn(async () => {}),
}));

import { db } from "@/lib/db";
import { withOrgContext } from "@/lib/rls";
import { assertNotLocked } from "@/lib/fiscal-year-lock";

const anyDb = db as any;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Pins the fiscal-lock enforcement path (ADR-0001 + the pooled-session RLS
 * gap). `assertNotLocked` reads the lock under a transaction-scoped GUC via
 * withOrgContext — NOT the best-effort session-level client — so a pooled
 * connection that lost `app.organization_id` can never make a locked year
 * look unlocked.
 */
describe("assertNotLocked", () => {
  it("runs the lock read inside the org-scoped transaction", async () => {
    anyDb.fiscalYearLock.findFirst.mockResolvedValue(null);
    await assertNotLocked("org-1", new Date("2026-08-01"));
    expect(withOrgContext).toHaveBeenCalledWith(db, "org-1", false);
    expect(anyDb.fiscalYearLock.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        isLocked: true,
        startDate: { lte: new Date("2026-08-01") },
        endDate: { gte: new Date("2026-08-01") },
      },
      select: { fiscalYear: true },
    });
  });

  it("throws FORBIDDEN when the date falls inside a locked fiscal year", async () => {
    anyDb.fiscalYearLock.findFirst.mockResolvedValue({ fiscalYear: "2082/83" });
    await expect(assertNotLocked("org-1", new Date("2026-08-01"))).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("Fiscal year 2082/83 is locked"),
    });
  });

  it("returns without querying when there is no organization", async () => {
    await assertNotLocked(undefined, new Date("2026-08-01"));
    expect(anyDb.fiscalYearLock.findFirst).not.toHaveBeenCalled();
    expect(withOrgContext).not.toHaveBeenCalled();
  });
});
