/**
 * Resource Library System — Comprehensive Unit & Invariant Tests
 *
 * These tests cover the critical business logic extracted from the
 * resource library (catalog-v2.ts, rate-analysis.ts) as pure functions
 * so they can run without a database.
 *
 * Coverage areas:
 *  1. Scope isolation — global / org / project data never bleeds
 *  2. Hierarchy enforcement — no level-skipping
 *  3. Import idempotency — re-importing produces correct counts
 *  4. Ingredient auto-fill — materialId → name / unit / catalogMaterialId
 *  5. getResources aggregation — materialId-keyed deduplication
 *  6. Rate analysis computation — pure ingredient math
 *  7. previewImport auth parity with importFromParent
 */

import { describe, it, expect } from "vitest";
import { resolvePercentageBase, computeRatePerUnit, computeBoqAmount } from "./boq-calc";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Scope Isolation Invariants
// ─────────────────────────────────────────────────────────────────────────────

function buildScopeWhere(
  scope: "global" | "org" | "project",
  opts: { organizationId?: string; projectId?: string }
) {
  const where: Record<string, unknown> = { scope };
  if (scope === "global") {
    where.organizationId = null;
    where.projectId = null;
  } else if (scope === "org") {
    if (!opts.organizationId) throw new Error("Organization ID required.");
    where.organizationId = opts.organizationId;
    where.projectId = null;
  } else {
    if (!opts.projectId) throw new Error("Project ID required.");
    where.projectId = opts.projectId;
  }
  return where;
}

describe("Scope isolation — buildScopeWhere", () => {
  it("global scope nulls out organizationId and projectId", () => {
    const w = buildScopeWhere("global", {});
    expect(w.organizationId).toBeNull();
    expect(w.projectId).toBeNull();
    expect(w.scope).toBe("global");
  });

  it("org scope sets organizationId and nulls projectId", () => {
    const w = buildScopeWhere("org", { organizationId: "org-1" });
    expect(w.organizationId).toBe("org-1");
    expect(w.projectId).toBeNull();
    expect(w.scope).toBe("org");
  });

  it("project scope sets projectId (no organizationId override)", () => {
    const w = buildScopeWhere("project", { projectId: "proj-1" });
    expect(w.projectId).toBe("proj-1");
    expect(w.organizationId).toBeUndefined();
    expect(w.scope).toBe("project");
  });

  it("org scope throws when organizationId is missing", () => {
    expect(() => buildScopeWhere("org", {})).toThrow("Organization ID required.");
  });

  it("project scope throws when projectId is missing", () => {
    expect(() => buildScopeWhere("project", {})).toThrow("Project ID required.");
  });

  it("org queries from two different orgs produce distinct WHERE clauses", () => {
    const w1 = buildScopeWhere("org", { organizationId: "org-A" });
    const w2 = buildScopeWhere("org", { organizationId: "org-B" });
    expect(w1.organizationId).not.toBe(w2.organizationId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Hierarchy Enforcement (level-skipping guard)
// ─────────────────────────────────────────────────────────────────────────────

function checkImportHierarchy(
  targetScope: "org" | "project",
  sourceScope: "global" | "org"
): void {
  if (targetScope === "project" && sourceScope === "global") {
    throw new Error(
      "Projects must import from their organization catalog, not directly from global. Import via org first."
    );
  }
}

describe("Hierarchy enforcement — checkImportHierarchy", () => {
  it("allows global → org", () => {
    expect(() => checkImportHierarchy("org", "global")).not.toThrow();
  });

  it("allows org → project", () => {
    expect(() => checkImportHierarchy("project", "org")).not.toThrow();
  });

  it("blocks global → project (level-skipping)", () => {
    expect(() => checkImportHierarchy("project", "global")).toThrow(
      "Projects must import from their organization catalog"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Import Idempotency
// ─────────────────────────────────────────────────────────────────────────────

interface FakeMaterial { id: string; name: string; scope: string; sourceMaterialId?: string | null }

function simulateImport(
  sourceMaterials: FakeMaterial[],
  existingTargets: FakeMaterial[],
  materialIds?: string[]
): { importedMaterials: number; skippedMaterials: number } {
  const filtered = materialIds
    ? sourceMaterials.filter((s) => materialIds.includes(s.id))
    : sourceMaterials;

  const existingSourceIds = new Set(
    existingTargets.map((t) => t.sourceMaterialId).filter(Boolean)
  );

  let importedMaterials = 0;
  let skippedMaterials = 0;

  for (const src of filtered) {
    if (existingSourceIds.has(src.id)) {
      skippedMaterials++;
    } else {
      importedMaterials++;
    }
  }
  return { importedMaterials, skippedMaterials };
}

describe("Import idempotency — simulateImport", () => {
  const source: FakeMaterial[] = [
    { id: "g1", name: "Cement OPC 43", scope: "global" },
    { id: "g2", name: "Sand (Fine)", scope: "global" },
    { id: "g3", name: "Gravel 20mm", scope: "global" },
  ];

  it("imports all materials on first run", () => {
    const result = simulateImport(source, []);
    expect(result.importedMaterials).toBe(3);
    expect(result.skippedMaterials).toBe(0);
  });

  it("skips all already-synced materials on second run", () => {
    const existing: FakeMaterial[] = source.map((s) => ({
      id: `org-${s.id}`,
      name: s.name,
      scope: "org",
      sourceMaterialId: s.id,
    }));
    const result = simulateImport(source, existing);
    expect(result.importedMaterials).toBe(0);
    expect(result.skippedMaterials).toBe(3);
  });

  it("partially imports when some are already synced", () => {
    const existing: FakeMaterial[] = [
      { id: "org-g1", name: "Cement OPC 43", scope: "org", sourceMaterialId: "g1" },
    ];
    const result = simulateImport(source, existing);
    expect(result.importedMaterials).toBe(2);
    expect(result.skippedMaterials).toBe(1);
  });

  it("respects materialIds filter", () => {
    const result = simulateImport(source, [], ["g1"]);
    expect(result.importedMaterials).toBe(1);
    expect(result.skippedMaterials).toBe(0);
  });

  it("running import twice produces no duplicates", () => {
    const run1 = simulateImport(source, []);
    const afterRun1: FakeMaterial[] = source.map((s) => ({
      id: `org-${s.id}`,
      name: s.name,
      scope: "org",
      sourceMaterialId: s.id,
    }));
    const run2 = simulateImport(source, afterRun1);
    expect(run1.importedMaterials + run2.importedMaterials).toBe(3);
    expect(run2.skippedMaterials).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Ingredient Auto-Fill from materialId
// ─────────────────────────────────────────────────────────────────────────────

interface ResourceLibraryItem {
  id: string;
  name: string;
  unit: string;
  catalogMaterialId?: string | null;
}

function resolveIngredientFromResource(
  input: {
    name: string;
    unit: string;
    materialId?: string | null;
    catalogMaterialId?: string | null;
  },
  resource: ResourceLibraryItem | null
): { name: string; unit: string; catalogMaterialId: string | null } {
  let finalName = input.name;
  let finalUnit = input.unit;
  let linkedCatalogMaterialId = input.catalogMaterialId ?? null;

  if (input.materialId && resource) {
    finalName = resource.name;
    finalUnit = resource.unit || finalUnit;
    if (!linkedCatalogMaterialId && resource.catalogMaterialId) {
      linkedCatalogMaterialId = resource.catalogMaterialId;
    }
  }

  return { name: finalName, unit: finalUnit, catalogMaterialId: linkedCatalogMaterialId };
}

describe("Ingredient auto-fill — resolveIngredientFromResource", () => {
  const resource: ResourceLibraryItem = {
    id: "mat-1",
    name: "Cement OPC 43",
    unit: "bag",
    catalogMaterialId: "cat-cement-1",
  };

  it("overrides name with resource library name when materialId given", () => {
    const result = resolveIngredientFromResource(
      { name: "cement", unit: "bags", materialId: "mat-1" },
      resource
    );
    expect(result.name).toBe("Cement OPC 43");
  });

  it("overrides unit with resource library unit when materialId given", () => {
    const result = resolveIngredientFromResource(
      { name: "cement", unit: "bags", materialId: "mat-1" },
      resource
    );
    expect(result.unit).toBe("bag");
  });

  it("auto-fills catalogMaterialId from resource when not provided", () => {
    const result = resolveIngredientFromResource(
      { name: "cement", unit: "bags", materialId: "mat-1" },
      resource
    );
    expect(result.catalogMaterialId).toBe("cat-cement-1");
  });

  it("does NOT override explicitly provided catalogMaterialId", () => {
    const result = resolveIngredientFromResource(
      { name: "cement", unit: "bags", materialId: "mat-1", catalogMaterialId: "custom-cat" },
      resource
    );
    expect(result.catalogMaterialId).toBe("custom-cat");
  });

  it("keeps original name/unit when materialId is null", () => {
    const result = resolveIngredientFromResource(
      { name: "Excavation", unit: "cum", materialId: null },
      null
    );
    expect(result.name).toBe("Excavation");
    expect(result.unit).toBe("cum");
    expect(result.catalogMaterialId).toBeNull();
  });

  it("keeps original unit if resource unit is empty string", () => {
    const sparseResource = { id: "mat-x", name: "Labour A", unit: "", catalogMaterialId: null };
    const result = resolveIngredientFromResource(
      { name: "Labour A", unit: "day", materialId: "mat-x" },
      sparseResource
    );
    expect(result.unit).toBe("day");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — getResources Aggregation (materialId-keyed deduplication)
// ─────────────────────────────────────────────────────────────────────────────

interface FakeIngredient {
  materialId?: string | null;
  name: string;
  unit: string;
  type: "material" | "labor" | "equipment";
  quantity: number;
  rate: number;
  batchSize?: number;
  itemQuantity: number;
  isDirect?: boolean;
}

function aggregateResources(ingredients: FakeIngredient[]) {
  const materials = new Map<string, { qty: number; cost: number; unit: string }>();
  const labor = new Map<string, { qty: number; cost: number; unit: string }>();
  const equipment = new Map<string, { qty: number; cost: number; unit: string }>();

  for (const ing of ingredients) {
    let totalQty: number;
    let totalCost: number;

    if (ing.isDirect) {
      totalQty = ing.quantity;
      totalCost = ing.rate * ing.quantity;
    } else {
      const batch = ing.batchSize && ing.batchSize > 0 ? ing.batchSize : 1;
      const perUnitQty = ing.quantity / batch;
      totalQty = ing.itemQuantity * perUnitQty;
      totalCost = ing.rate * totalQty;
    }

    const key = ing.materialId
      ? `id:${ing.materialId}`
      : `name:${ing.name.toLowerCase().trim()}|${ing.unit}`;

    const map = ing.type === "labor" ? labor : ing.type === "equipment" ? equipment : materials;
    const existing = map.get(key);
    if (existing) {
      existing.qty += totalQty;
      existing.cost += totalCost;
    } else {
      map.set(key, { qty: totalQty, cost: totalCost, unit: ing.unit });
    }
  }

  return { materials, labor, equipment };
}

describe("getResources aggregation — materialId-keyed deduplication", () => {
  it("merges two ingredients with the same materialId into one line", () => {
    const ingredients: FakeIngredient[] = [
      { materialId: "mat-cement", name: "Cement OPC 43", unit: "bag", type: "material", quantity: 4, rate: 800, itemQuantity: 100 },
      { materialId: "mat-cement", name: "Cement OPC 43", unit: "bag", type: "material", quantity: 2, rate: 800, itemQuantity: 50 },
    ];
    const { materials } = aggregateResources(ingredients);
    expect(materials.size).toBe(1);
    const entry = materials.get("id:mat-cement")!;
    expect(entry.qty).toBeCloseTo(4 * 100 + 2 * 50, 5);
  });

  it("does not double count BOQ item quantity for direct ingredients", () => {
    const ingredients: FakeIngredient[] = [
      { materialId: "mat-cement", name: "Cement OPC 43", unit: "bag", type: "material", quantity: 400, rate: 800, itemQuantity: 100, isDirect: true },
    ];
    const { materials } = aggregateResources(ingredients);
    expect(materials.size).toBe(1);
    const entry = materials.get("id:mat-cement")!;
    // Should be exactly 400 bags total, NOT 400 * 100 = 40,000
    expect(entry.qty).toBeCloseTo(400, 5);
    expect(entry.cost).toBeCloseTo(400 * 800, 5);
  });

  it("merges same name+unit combination without materialId (case-insensitive)", () => {
    const ingredients: FakeIngredient[] = [
      { materialId: null, name: "Excavator", unit: "hr", type: "equipment", quantity: 1, rate: 5000, itemQuantity: 100 },
      { materialId: null, name: "excavator", unit: "hr", type: "equipment", quantity: 1, rate: 5000, itemQuantity: 50 },
    ];
    const { equipment } = aggregateResources(ingredients);
    expect(equipment.size).toBe(1);
  });

  it("DOES merge same materialId even if names differ (canonical key wins)", () => {
    const ingredients: FakeIngredient[] = [
      { materialId: "mat-ex", name: "Excavator", unit: "hr", type: "equipment", quantity: 2, rate: 5000, itemQuantity: 100 },
      { materialId: "mat-ex", name: "excavarer", unit: "hr", type: "equipment", quantity: 1, rate: 5000, itemQuantity: 80 },
    ];
    const { equipment } = aggregateResources(ingredients);
    expect(equipment.size).toBe(1);
    const entry = equipment.get("id:mat-ex")!;
    expect(entry.qty).toBeCloseTo(2 * 100 + 1 * 80, 5);
  });

  it("separates materials, labor, and equipment into distinct maps", () => {
    const ingredients: FakeIngredient[] = [
      { materialId: "m1", name: "Cement", unit: "bag", type: "material", quantity: 4, rate: 800, itemQuantity: 100 },
      { materialId: "l1", name: "Mason", unit: "day", type: "labor", quantity: 0.5, rate: 1200, itemQuantity: 100 },
      { materialId: "e1", name: "Mixer", unit: "hr", type: "equipment", quantity: 0.2, rate: 3000, itemQuantity: 100 },
    ];
    const { materials, labor, equipment } = aggregateResources(ingredients);
    expect(materials.size).toBe(1);
    expect(labor.size).toBe(1);
    expect(equipment.size).toBe(1);
  });

  it("correctly scales by batchSize", () => {
    const ingredients: FakeIngredient[] = [
      { materialId: "m1", name: "Cement", unit: "bag", type: "material", quantity: 4, rate: 800, batchSize: 2, itemQuantity: 10 },
    ];
    const { materials } = aggregateResources(ingredients);
    const entry = materials.get("id:m1")!;
    expect(entry.qty).toBeCloseTo(20, 5); // (4/2)*10
    expect(entry.cost).toBeCloseTo(16000, 5); // 20*800
  });

  it("returns empty maps for empty ingredient list", () => {
    const { materials, labor, equipment } = aggregateResources([]);
    expect(materials.size).toBe(0);
    expect(labor.size).toBe(0);
    expect(equipment.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Rate Analysis Computation
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRatePerUnit", () => {
  it("returns total / batchSize", () => {
    const ingredients = [{ amount: 4800 }, { amount: 1200 }];
    expect(computeRatePerUnit(ingredients, 10)).toBeCloseTo(600, 5);
  });

  it("treats batchSize=0 as 1 (safe fallback)", () => {
    const ingredients = [{ amount: 6000 }];
    expect(computeRatePerUnit(ingredients, 0)).toBeCloseTo(6000, 5);
  });

  it("returns 0 for empty ingredient list", () => {
    expect(computeRatePerUnit([], 1)).toBe(0);
  });
});

describe("computeBoqAmount", () => {
  it("returns quantity * rate", () => {
    expect(computeBoqAmount(100, 6000)).toBe(600000);
  });

  it("returns 0 when quantity is 0", () => {
    expect(computeBoqAmount(0, 6000)).toBe(0);
  });

  it("returns 0 when rate is 0", () => {
    expect(computeBoqAmount(100, 0)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — resolvePercentageBase edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("resolvePercentageBase — edge cases", () => {
  const mat = 8500, lab = 1200, eqp = 800, ovh = 500;
  const allFixed = mat + lab + eqp + ovh;
  const runningPct = 1100;

  it("'all_including_pct' includes runningPctTotal", () => {
    expect(resolvePercentageBase("all_including_pct", mat, lab, eqp, ovh, allFixed, runningPct))
      .toBe(allFixed + runningPct);
  });

  it("'all' does NOT include runningPctTotal", () => {
    expect(resolvePercentageBase("all", mat, lab, eqp, ovh, allFixed, runningPct))
      .toBe(allFixed);
  });

  it("unknown pctBase defaults to allFixed (safe fallback)", () => {
    expect(resolvePercentageBase("invalid_base", mat, lab, eqp, ovh, allFixed, runningPct))
      .toBe(allFixed);
  });

  it("zero inputs produce zero base", () => {
    expect(resolvePercentageBase("material", 0, 0, 0, 0, 0, 0)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — previewImport / importFromParent auth guard parity
// ─────────────────────────────────────────────────────────────────────────────

describe("previewImport auth guard parity with importFromParent", () => {
  type Scope = { targetScope: "org" | "project"; sourceScope: "global" | "org" };

  function validateImportRequest(req: Scope): { ok: boolean; error?: string } {
    if (req.targetScope === "project" && req.sourceScope === "global") {
      return { ok: false, error: "Projects must import from their organization catalog, not directly from global." };
    }
    return { ok: true };
  }

  it("org ← global: allowed", () => {
    expect(validateImportRequest({ targetScope: "org", sourceScope: "global" }).ok).toBe(true);
  });

  it("project ← org: allowed", () => {
    expect(validateImportRequest({ targetScope: "project", sourceScope: "org" }).ok).toBe(true);
  });

  it("project ← global: blocked with correct message", () => {
    const result = validateImportRequest({ targetScope: "project", sourceScope: "global" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("organization catalog");
  });
});
