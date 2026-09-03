/**
 * Router-layer tests for fiscal-year.ts (district rate catalog switch).
 *
 * Pins:
 *   - preview: membership IDOR guard; missing target catalog → NOT_FOUND
 *   - preview math: rateDelta = target − baseline catalog rate;
 *     remainingQty = Σ(ingredient qty × BOQ item qty); costImpact =
 *     delta × remainingQty; changePct; rows sorted by |costImpact| desc;
 *     increase/decrease counters
 *   - execute: write-role gate; revision log persisted with from/to FY and
 *     per-material entries; project.activeFiscalYear flipped in the same
 *     transaction; totalCostImpact mirrors the preview
 *   - listProjectRevisions: membership gate, project-scoped logs
 *   - rollForwardCatalog: superadmin-only; rates copied with the inflation
 *     multiplier rounded to 2dp; source catalog linked for lineage
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { fiscalYearRouter } from "../fiscal-year";

const anyDb = db as any;
const ENGINEER = buildUser();
// H-7: rollForwardCatalog rides superAdminProcedure — requires a dedicated
// admin-session superadmin (isPlatformAdmin + sessionKind "admin").
const SUPERADMIN = buildUser({ isSuperAdmin: true, isPlatformAdmin: true, sessionKind: "admin" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

/** Project with one catalog-linked material and one BOQ item consuming 2/unit. */
function project() {
  return {
    id: "p-1",
    organizationId: "org-1",
    activeFiscalYear: "2081/82",
    materials: [
      {
        id: "m-1",
        name: "Cement",
        unit: "bag",
        catalogMaterialId: "cm-1",
        catalogMaterial: { defaultRate: 900 },
      },
    ],
    boqItems: [
      {
        quantity: 100,
        ingredients: [{ type: "material", name: "cement", catalogMaterialId: "cm-1", quantity: 2 }],
      },
    ],
  };
}

/** Target FY catalog: cement rises 900 → 1000 in Morang. */
function targetCatalog() {
  return {
    id: "rb-2082",
    fiscalYear: "2082/83",
    catalogRates: [
      {
        materialId: "cm-1",
        rate: 1000,
        district: "Morang",
        material: { normalizedName: "cement", name: "Cement" },
      },
    ],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── previewFiscalYearSwitch ────────────────────────────────────────────────
describe("fiscalYear.previewFiscalYearSwitch", () => {
  it("requires project membership (IDOR guard)", async () => {
    member(null);
    const caller = createCaller(fiscalYearRouter, ENGINEER);
    await expectTRPCError(
      caller.previewFiscalYearSwitch({ projectId: "p-1", targetFiscalYear: "2082/83" }),
      "FORBIDDEN",
    );
  });

  it("missing target catalog → NOT_FOUND", async () => {
    member("engineer");
    anyDb.project.findUnique.mockResolvedValue(project());
    anyDb.rateBook.findFirst.mockResolvedValue(null);
    const caller = createCaller(fiscalYearRouter, ENGINEER);
    await expectTRPCError(
      caller.previewFiscalYearSwitch({ projectId: "p-1", targetFiscalYear: "2099/00" }),
      "NOT_FOUND",
    );
  });

  it("computes rate delta × remaining BOQ quantity as cost impact", async () => {
    member("engineer");
    anyDb.project.findUnique.mockResolvedValue(project());
    anyDb.rateBook.findFirst.mockResolvedValue(targetCatalog());

    const caller = createCaller(fiscalYearRouter, ENGINEER);
    const res = await caller.previewFiscalYearSwitch({ projectId: "p-1", targetFiscalYear: "2082/83" });

    expect(res.currentFiscalYear).toBe("2081/82");
    expect(res.targetFiscalYear).toBe("2082/83");
    expect(res.itemsIncreased).toBe(1);
    expect(res.itemsDecreased).toBe(0);
    expect(res.totalMaterials).toBe(1);

    const row = res.rows[0];
    expect(row.oldRate).toBe(900);
    expect(row.newRate).toBe(1000);
    expect(row.rateDelta).toBe(100);
    // remaining qty = 2 bags/item × 100 items = 200 → +100 × 200 = +20,000
    expect(row.estimatedRemainingQty).toBe(200);
    expect(row.costImpact).toBe(20000);
    expect(row.changePct).toBeCloseTo(11.111, 2);
    expect(res.totalCostImpact).toBe(20000);
  });

  it("sorts rows by absolute cost impact (descending)", async () => {
    member("engineer");
    const proj = project();
    proj.materials.push({
      id: "m-2",
      name: "Steel",
      unit: "kg",
      catalogMaterialId: "cm-2",
      catalogMaterial: { defaultRate: 120 },
    });
    anyDb.project.findUnique.mockResolvedValue(proj);
    anyDb.rateBook.findFirst.mockResolvedValue({
      ...targetCatalog(),
      catalogRates: [
        ...targetCatalog().catalogRates,
        { materialId: "cm-2", rate: 110, district: "Morang", material: { normalizedName: "steel", name: "Steel" } },
      ],
    });

    const caller = createCaller(fiscalYearRouter, ENGINEER);
    const res = await caller.previewFiscalYearSwitch({ projectId: "p-1", targetFiscalYear: "2082/83" });
    // Steel has no BOQ demand (impact 0), Cement has 20,000 → cement first
    expect(res.rows[0].materialName).toBe("Cement");
    expect(res.rows[1].materialName).toBe("Steel");
  });
});

// ─── executeFiscalYearSwitch ────────────────────────────────────────────────
describe("fiscalYear.executeFiscalYearSwitch", () => {
  it("requires write access (non-members blocked)", async () => {
    member(null);
    const caller = createCaller(fiscalYearRouter, ENGINEER);
    await expectTRPCError(
      caller.executeFiscalYearSwitch({ projectId: "p-1", targetFiscalYear: "2082/83" }),
      "FORBIDDEN",
    );
  });

  it("persists the revision log and flips the project's active FY atomically", async () => {
    member("engineer");
    anyDb.project.findUnique.mockResolvedValue(project());
    anyDb.rateBook.findFirst.mockResolvedValue(targetCatalog());

    const caller = createCaller(fiscalYearRouter, ENGINEER);
    const res = await caller.executeFiscalYearSwitch({
      projectId: "p-1",
      targetFiscalYear: "2082/83",
    });

    expect(res.success).toBe(true);
    expect(res.fromFiscalYear).toBe("2081/82");
    expect(res.toFiscalYear).toBe("2082/83");
    expect(res.totalCostImpact).toBe(20000);
    expect(res.totalEntries).toBe(1);

    const logData = anyDb.marketRateRevisionLog.create.mock.calls[0][0].data;
    expect(logData.revisionType).toBe("fiscal_year_switch");
    expect(logData.fromFiscalYear).toBe("2081/82");
    expect(logData.toFiscalYear).toBe("2082/83");
    expect(logData.loggedById).toBe(ENGINEER.id);
    expect(logData.totalCostImpact).toBe(20000);
    expect(logData.entries.createMany.data[0]).toEqual(
      expect.objectContaining({ materialName: "Cement", oldMarketRate: 900, newMarketRate: 1000, rateDelta: 100 }),
    );

    expect(anyDb.project.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { activeFiscalYear: "2082/83" },
    });
  });

  it("missing target catalog → NOT_FOUND before any write", async () => {
    member("engineer");
    anyDb.project.findUnique.mockResolvedValue(project());
    anyDb.rateBook.findFirst.mockResolvedValue(null);
    const caller = createCaller(fiscalYearRouter, ENGINEER);
    await expectTRPCError(
      caller.executeFiscalYearSwitch({ projectId: "p-1", targetFiscalYear: "2099/00" }),
      "NOT_FOUND",
    );
    expect(anyDb.marketRateRevisionLog.create).not.toHaveBeenCalled();
  });
});

// ─── listProjectRevisions ───────────────────────────────────────────────────
describe("fiscalYear.listProjectRevisions", () => {
  it("requires project membership", async () => {
    member(null);
    const caller = createCaller(fiscalYearRouter, ENGINEER);
    await expectTRPCError(
      caller.listProjectRevisions({ projectId: "p-1" }),
      "FORBIDDEN",
    );
  });

  it("returns project-scoped revision logs", async () => {
    member("engineer");
    anyDb.marketRateRevisionLog.findMany.mockResolvedValue([
      { id: "rev-1", projectId: "p-1", toFiscalYear: "2082/83" },
    ]);
    const caller = createCaller(fiscalYearRouter, ENGINEER);
    const res = await caller.listProjectRevisions({ projectId: "p-1" });
    expect(res.logs).toHaveLength(1);
    expect(anyDb.marketRateRevisionLog.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
    });
  });
});

// ─── rollForwardCatalog ─────────────────────────────────────────────────────
describe("fiscalYear.rollForwardCatalog", () => {
  it("non-superadmins are FORBIDDEN before any db access", async () => {
    member("project_manager");
    const caller = createCaller(fiscalYearRouter, ENGINEER);
    await expectTRPCError(
      caller.rollForwardCatalog({ sourceCatalogId: "rb-2081", targetFiscalYear: "2082/83" }),
      "FORBIDDEN",
    );
    expect(anyDb.rateBook.findUnique).not.toHaveBeenCalled();
  });

  it("copies rates with the inflation multiplier rounded to 2dp and links the source", async () => {
    const caller = createCaller(fiscalYearRouter, SUPERADMIN);
    anyDb.rateBook.findUnique.mockResolvedValue({
      id: "rb-2081",
      fiscalYear: "2081/82",
      districts: ["Morang", "Kathmandu"],
      catalogRates: [
        { id: "r-1", materialId: "cm-1", district: "Morang", rate: 123.456 },
      ],
    });

    await caller.rollForwardCatalog({
      sourceCatalogId: "rb-2081",
      targetFiscalYear: "2082/83",
      inflationMultiplier: 1.05,
    });

    expect(anyDb.rateBook.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "District Rates 2082/83",
        fiscalYear: "2082/83",
        scope: "global",
        isActive: true,
        isBaseline: true,
        sourceCatalogId: "rb-2081",
        districts: ["Morang", "Kathmandu"],
      }),
    });

    // 123.456 × 1.05 = 129.6288 → rounds to 129.63
    expect(anyDb.rateEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          materialId: "cm-1",
          district: "Morang",
          rate: 129.63,
          sourceRateEntryId: "r-1",
        }),
      ],
    });
  });

  it("unknown source catalog → NOT_FOUND", async () => {
    const caller = createCaller(fiscalYearRouter, SUPERADMIN);
    anyDb.rateBook.findUnique.mockResolvedValue(null);
    await expectTRPCError(
      caller.rollForwardCatalog({ sourceCatalogId: "nope", targetFiscalYear: "2082/83" }),
      "NOT_FOUND",
    );
  });
});
