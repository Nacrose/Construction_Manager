/**
 * Tests for the daily-report → ProjectCost auto-capture resync.
 *
 * Pins (B8 regression):
 *   - captureReportCosts ALWAYS clears this report's previously captured
 *     rows before writing — including when the corrected report nets to
 *     zero cost. Previously the zero-cost early-return skipped the
 *     deleteMany, so a rejected-then-corrected report left inflated cost
 *     entries in the ledger permanently.
 *   - a non-empty capture still writes delete-then-create (idempotent resync).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("../../routers/__tests__/test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { processReportSubmission } from "../daily-report-sync";

const anyDb = db as any;

const ACTOR = { organizationId: "org-1", isSuperAdmin: false };

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: "r-1",
    number: "DR-0001",
    projectId: "p-1",
    reportDate: new Date("2026-08-20"),
    materialConsumed: [],
    workProgress: [],
    workforce: [],
    equipmentUsed: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("processReportSubmission → captureReportCosts resync", () => {
  it("B8 regression: zero-cost corrected report still clears stale captured rows", async () => {
    // One progress row with NO actualQty → costsToCreate ends up empty.
    // The pre-fix code returned before the deleteMany, leaving the rows
    // captured by the earlier (rejected) submission in the ledger forever.
    anyDb.dailyReport.findUnique.mockResolvedValue(
      report({ workProgress: [{ boqCode: "B.01", actualQty: 0, unit: "bag" }] }),
    );

    await processReportSubmission({
      reportId: "r-1",
      projectId: "p-1",
      userId: "user-1",
      actor: ACTOR,
    });

    expect(anyDb.projectCost.deleteMany).toHaveBeenCalledWith({
      where: { projectId: "p-1", source: "daily_report", sourceRefId: "r-1" },
    });
    expect(anyDb.projectCost.createMany).not.toHaveBeenCalled();
  });

  it("non-empty capture is a delete-then-create resync (idempotent)", async () => {
    anyDb.dailyReport.findUnique.mockResolvedValue(
      report({
        workProgress: [{ boqCode: "B.01", actualQty: 10, unit: "bag", boqDesc: null }],
      }),
    );
    // Ingredient math: 2 (qty/unit) × 10 (actualQty) × 50 (rate) = 1000
    anyDb.boqItem.findMany.mockResolvedValue([
      {
        id: "boq-1",
        code: "B.01",
        description: "Brickwork",
        ingredients: [{ type: "material", quantity: 2, rate: 50, name: "Cement", amount: 100 }],
        dailyProgramTasks: [],
      },
    ]);
    anyDb.project.findUnique.mockResolvedValue({
      skilledWageRate: 100,
      unskilledWageRate: 60,
      supervisorWageRate: 150,
      ownedEquipRate: 300,
      hiredEquipRate: 400,
      fuelPricePerLiter: 150,
    });

    await processReportSubmission({
      reportId: "r-1",
      projectId: "p-1",
      userId: "user-1",
      actor: ACTOR,
    });

    expect(anyDb.projectCost.deleteMany).toHaveBeenCalledWith({
      where: { projectId: "p-1", source: "daily_report", sourceRefId: "r-1" },
    });
    expect(anyDb.projectCost.createMany).toHaveBeenCalledTimes(1);
    const rows = anyDb.projectCost.createMany.mock.calls[0][0].data;
    const materialRow = rows.find((r: any) => r.category === "material");
    expect(materialRow.amount).toBe(1000);
    expect(materialRow.source).toBe("daily_report");
    expect(materialRow.sourceRefId).toBe("r-1");
  });
});
