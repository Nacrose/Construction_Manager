/**
 * Router-layer tests for project-cost.ts (PM cost ledger).
 *
 * Pins:
 *   - Membership gate on every read; write gate on create/delete
 *   - list: date-range/category/source/boqItemId filters land in the where
 *     clause; limit is passed through (capped by zod at 500)
 *   - stats: total / byCategory / bySource / byDate / byBoqItem aggregation
 *     math computed over the fetched rows
 *   - create: receipt size cap (5MB base64), positive amount (zod),
 *     source hardcoded "manual", audit written
 *   - delete: auto-captured costs (daily_report/ipc/purchase_order) are
 *     immutable from this router — only manual entries can be removed
 *   - exportCsv: header row, en-GB dates, two-decimal amounts, and CSV
 *     quote-escaping (`"` doubled) so hostile cell content can't break out
 *     of the cell when opened in Excel
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { db } from "@/lib/db";
import { projectCostRouter } from "../project-cost";

const anyDb = db as any;
const ENGINEER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function costRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    projectId: "p-1",
    date: new Date("2026-08-15T00:00:00.000Z"),
    amount: 100,
    category: "material",
    source: "manual",
    boqItemId: "boq-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── list ───────────────────────────────────────────────────────────────────
describe("projectCost.list", () => {
  it("requires project membership", async () => {
    member(null);
    const caller = createCaller(projectCostRouter, ENGINEER);
    await expectTRPCError(caller.list({ projectId: "p-1" }), "FORBIDDEN");
  });

  it("applies date/category/source/boq filters to the where clause", async () => {
    member("engineer");
    anyDb.projectCost.findMany.mockResolvedValue([]);
    const caller = createCaller(projectCostRouter, ENGINEER);
    await caller.list({
      projectId: "p-1",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      category: "material",
      source: "manual",
      boqItemId: "boq-1",
      limit: 50,
    });
    const arg = anyDb.projectCost.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      projectId: "p-1",
      date: {
        gte: new Date("2026-08-01T00:00:00.000Z"),
        lte: new Date("2026-08-31T00:00:00.000Z"),
      },
      category: "material",
      source: "manual",
      boqItemId: "boq-1",
    });
    expect(arg.take).toBe(50);
  });

  it("rejects limit above 500 (zod cap)", async () => {
    member("engineer");
    const caller = createCaller(projectCostRouter, ENGINEER);
    await expectTRPCError(
      caller.list({ projectId: "p-1", limit: 501 } as any),
      "BAD_REQUEST",
    );
  });
});

// ─── stats ──────────────────────────────────────────────────────────────────
describe("projectCost.stats", () => {
  it("aggregates total / byCategory / bySource / byDate / byBoqItem", async () => {
    member("engineer");
    anyDb.projectCost.findMany.mockResolvedValue([
      costRow(),
      costRow({ id: "c-2", amount: 50, category: "labor", boqItemId: null }),
      costRow({ id: "c-3", amount: 25, category: "material", source: "daily_report" }),
    ]);
    const caller = createCaller(projectCostRouter, ENGINEER);
    const res = await caller.stats({ projectId: "p-1" });

    expect(res.total).toBe(175);
    expect(res.count).toBe(3);
    expect(res.byCategory).toEqual({ material: 125, labor: 50 });
    expect(res.bySource).toEqual({ manual: 150, daily_report: 25 });
    expect(res.byDate["2026-08-15"]).toBe(175);
    expect(res.byBoqItem).toEqual({ "boq-1": 125 }); // c-1 (100) + c-3 (25), boq-less rows excluded
  });
});

// ─── create ─────────────────────────────────────────────────────────────────
describe("projectCost.create", () => {
  const baseInput = {
    projectId: "p-1",
    amount: 4500,
    category: "material" as const,
    description: "Diesel",
  };

  it("requires write access (non-members blocked)", async () => {
    member(null);
    const caller = createCaller(projectCostRouter, ENGINEER);
    await expectTRPCError(caller.create(baseInput), "FORBIDDEN");
  });

  it("rejects receipt payloads above the 5MB cap", async () => {
    member("engineer");
    const caller = createCaller(projectCostRouter, ENGINEER);
    // base64 length 7,000,000 → ~5.25MB decoded > 5MB
    await expectTRPCError(
      caller.create({ ...baseInput, receiptData: "A".repeat(7_000_000) }),
      "BAD_REQUEST",
    );
    expect(anyDb.projectCost.create).not.toHaveBeenCalled();
  });

  it("stores a manual cost with source 'manual' and the acting user", async () => {
    member("engineer");
    anyDb.projectCost.create.mockResolvedValue(costRow());
    const caller = createCaller(projectCostRouter, ENGINEER);
    await caller.create({ ...baseInput, date: "2026-08-15", vendor: "Sita Depot" });

    const data = anyDb.projectCost.create.mock.calls[0][0].data;
    expect(data.source).toBe("manual");
    expect(data.createdById).toBe(ENGINEER.id);
    expect(data.vendor).toBe("Sita Depot");
    expect(data.date).toEqual(new Date("2026-08-15T00:00:00.000Z"));
  });

  it("rejects non-positive amounts (zod)", async () => {
    member("engineer");
    const caller = createCaller(projectCostRouter, ENGINEER);
    await expectTRPCError(
      caller.create({ ...baseInput, amount: 0 }),
      "BAD_REQUEST",
    );
  });
});

// ─── delete ─────────────────────────────────────────────────────────────────
describe("projectCost.delete", () => {
  it("auto-captured costs cannot be deleted here", async () => {
    member("engineer");
    anyDb.projectCost.findFirst.mockResolvedValue(costRow({ source: "ipc" }));
    const caller = createCaller(projectCostRouter, ENGINEER);
    await expectTRPCError(
      caller.delete({ id: "c-1", projectId: "p-1" }),
      "BAD_REQUEST",
    );
    expect(anyDb.projectCost.delete).not.toHaveBeenCalled();
  });

  it("manual costs can be deleted", async () => {
    member("engineer");
    anyDb.projectCost.findFirst.mockResolvedValue(costRow());
    const caller = createCaller(projectCostRouter, ENGINEER);
    const res = await caller.delete({ id: "c-1", projectId: "p-1" });
    expect(res.ok).toBe(true);
    expect(anyDb.projectCost.delete).toHaveBeenCalledWith({ where: { id: "c-1" } });
  });

  it("unknown id → NOT_FOUND", async () => {
    member("engineer");
    anyDb.projectCost.findFirst.mockResolvedValue(null);
    const caller = createCaller(projectCostRouter, ENGINEER);
    await expectTRPCError(
      caller.delete({ id: "c-x", projectId: "p-1" }),
      "NOT_FOUND",
    );
  });
});

// ─── exportCsv ──────────────────────────────────────────────────────────────
describe("projectCost.exportCsv", () => {
  it("escapes embedded quotes and formats amounts to 2 decimals", async () => {
    member("engineer");
    anyDb.projectCost.findMany.mockResolvedValue([
      costRow({
        amount: 1234.5,
        description: '3" pipe',
        vendor: "Vendor, Inc",
        subcategory: "plumbing",
      }),
    ]);
    const caller = createCaller(projectCostRouter, ENGINEER);
    const res = await caller.exportCsv({ projectId: "p-1" });

    expect(res.count).toBe(1);
    const lines = res.csv.split("\n");
    expect(lines[0].startsWith("Date,Amount,Category")).toBe(true);
    expect(lines[1]).toContain('"1234.50"');
    expect(lines[1]).toContain('"3"" pipe"'); // quote doubled
    expect(lines[1]).toContain('"Vendor, Inc"'); // comma safe inside quotes
    expect(lines[1]).toContain("15/08/2026"); // en-GB date
  });
});
