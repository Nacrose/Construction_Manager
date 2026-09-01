/**
 * Router-layer tests for material-crud.ts.
 *
 * Pins:
 *   - list / listByType: project-scoped where clauses (materials, suppliers,
 *     purchase orders all filter by projectId), resourceType + search filters,
 *     isActive-only on listByType
 *   - create: read-only roles (client/inspector) FORBIDDEN, catalogMaterialId
 *     takes precedence over the legacy materialCatalogId alias, zod rejects
 *     negative stock thresholds
 *   - update: NOT_FOUND for unknown ids, cross-project material FORBIDDEN
 *     (IDOR guard — authz runs against the material's OWN project), read-only
 *     role on the owning project FORBIDDEN, negative stock thresholds
 *     rejected by zod (create validates min(0) — update must too)
 *   - delete: NOT_FOUND / cross-project FORBIDDEN / happy path
 *   - checkProjectDeleteImpact: cross-project material ids FORBIDDEN
 *     (regression: previously ANY authenticated user could probe arbitrary
 *     material ids and learn cross-tenant reference counts), counts use
 *     verified ids only
 *   - deleteMany: assertCanWrite on EVERY distinct owning project before the
 *     bulk delete; no-op when nothing matches
 *   - listOrgInventory: org-scoped via project.organizationId, projectId
 *     filter, no-org user gets empty result, lastRate/lastDeliveredDate from
 *     latest transaction with 0/null fallbacks
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { materialCrudProcedures } from "../material-crud";
import { router } from "@/server/trpc";

const materialCrudRouter = router(materialCrudProcedures);

const anyDb = db as any;
const USER = buildUser();

/** Membership lookup keyed by projectId (for cross-project IDOR scenarios). */
function memberOf(map: Record<string, string | null>) {
  anyDb.projectMember.findUnique.mockImplementation(async ({ where }: any) => {
    const role = map[where.projectId_userId.projectId] ?? null;
    return role ? { role } : null;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── list ───────────────────────────────────────────────────────────────────
describe("materialCrud.list", () => {
  it("scopes materials, suppliers and purchase orders to the project", async () => {
    memberOf({ "p-1": "engineer" });
    const caller = createCaller(materialCrudRouter, USER);
    const res = await caller.list({ projectId: "p-1" });

    expect(anyDb.material.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
    expect(anyDb.supplier.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
    expect(anyDb.purchaseOrder.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
    expect(res.materials).toEqual([]);
    expect(res.suppliers).toEqual([]);
    expect(res.purchaseOrders).toEqual([]);
  });

  it("applies the resourceType filter to the material query only", async () => {
    memberOf({ "p-1": "engineer" });
    const caller = createCaller(materialCrudRouter, USER);
    await caller.list({ projectId: "p-1", resourceType: "equipment" });
    expect(anyDb.material.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      resourceType: "equipment",
    });
    expect(anyDb.supplier.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
  });

  it("FORBIDDENs non-members", async () => {
    memberOf({});
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(caller.list({ projectId: "p-1" }), "FORBIDDEN");
  });
});

// ─── listByType ─────────────────────────────────────────────────────────────
describe("materialCrud.listByType", () => {
  it("filters active items and searches name/code/category case-insensitively", async () => {
    memberOf({ "p-1": "engineer" });
    const caller = createCaller(materialCrudRouter, USER);
    await caller.listByType({ projectId: "p-1", search: "  cement  " });

    const where = anyDb.material.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe("p-1");
    expect(where.isActive).toBe(true);
    expect(where.OR).toEqual([
      { name: { contains: "cement", mode: "insensitive" } },
      { code: { contains: "cement", mode: "insensitive" } },
      { category: { contains: "cement", mode: "insensitive" } },
    ]);
  });

  it("FORBIDDENs non-members", async () => {
    memberOf({});
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(
      caller.listByType({ projectId: "p-1" }),
      "FORBIDDEN",
    );
  });
});

// ─── create ─────────────────────────────────────────────────────────────────
describe("materialCrud.create", () => {
  const baseInput = {
    projectId: "p-1",
    name: "Cement OPC 53",
    unit: "bags",
  };

  it("creates a material with the resourceType default and catalog precedence", async () => {
    memberOf({ "p-1": "engineer" });
    const caller = createCaller(materialCrudRouter, USER);
    await caller.create({
      ...baseInput,
      catalogMaterialId: "cat-new",
      materialCatalogId: "cat-legacy",
      minStock: 10,
      currentStock: 100,
      reorderLevel: 20,
    });

    expect(anyDb.material.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p-1",
        resourceType: "material",
        name: "Cement OPC 53",
        unit: "bags",
        catalogMaterialId: "cat-new", // catalogMaterialId wins over materialCatalogId
        minStock: 10,
        currentStock: 100,
        reorderLevel: 20,
      }),
    });
  });

  it("falls back to the legacy materialCatalogId alias when catalogMaterialId is absent", async () => {
    memberOf({ "p-1": "engineer" });
    const caller = createCaller(materialCrudRouter, USER);
    await caller.create({ ...baseInput, materialCatalogId: "cat-legacy" });
    expect(anyDb.material.create.mock.calls[0][0].data.catalogMaterialId).toBe("cat-legacy");
  });

  it("FORBIDDENs read-only roles (client, inspector)", async () => {
    memberOf({ "p-1": "client" });
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(
      caller.create({ ...baseInput }),
      "FORBIDDEN",
    );
    expect(anyDb.material.create).not.toHaveBeenCalled();
  });

  it("rejects negative stock thresholds (zod min(0))", async () => {
    memberOf({ "p-1": "engineer" });
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(
      caller.create({ ...baseInput, currentStock: -5 }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.create({ ...baseInput, reorderLevel: -1 }),
      "BAD_REQUEST",
    );
    expect(anyDb.material.create).not.toHaveBeenCalled();
  });

  it("creates initial stock MaterialTransaction when openingStock is provided", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.create.mockResolvedValue({ id: "mat-1", name: "Bitumen VG-30" });
    anyDb.materialTransaction.create.mockResolvedValue({ id: "txn-1" });

    const caller = createCaller(materialCrudRouter, USER);
    await caller.create({
      projectId: "p-1",
      name: "Bitumen VG-30",
      unit: "drums",
      openingStock: 50,
      openingRate: 12000,
      minStock: 10,
    });

    expect(anyDb.material.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        currentStock: 50,
      }),
    });
    expect(anyDb.materialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        materialId: "mat-1",
        projectId: "p-1",
        type: "adjustment",
        quantity: 50,
        rate: 12000,
        reference: "OPENING-STOCK",
      }),
    });
  });
});

// ─── update ─────────────────────────────────────────────────────────────────
describe("materialCrud.update", () => {
  it("updates fields on the material", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.findUnique.mockResolvedValue({ projectId: "p-1" });
    const caller = createCaller(materialCrudRouter, USER);
    await caller.update({ itemId: "m-1", name: "Cement OPC 43", unit: "bags" });
    expect(anyDb.material.update).toHaveBeenCalledWith({
      where: { id: "m-1" },
      data: expect.objectContaining({ name: "Cement OPC 43", unit: "bags" }),
    });
  });

  it("NOT_FOUNDs an unknown itemId", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.findUnique.mockResolvedValue(null);
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(
      caller.update({ itemId: "ghost", name: "X" }),
      "NOT_FOUND",
    );
    expect(anyDb.material.update).not.toHaveBeenCalled();
  });

  it("FORBIDDENs a material from a project the caller is not a member of (IDOR guard)", async () => {
    memberOf({ "p-1": "engineer" }); // membership only in p-1…
    anyDb.material.findUnique.mockResolvedValue({ projectId: "p-other" }); // …material lives elsewhere
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(
      caller.update({ itemId: "m-foreign", name: "X" }),
      "FORBIDDEN",
    );
    expect(anyDb.material.update).not.toHaveBeenCalled();
  });

  it("FORBIDDENs a read-only role on the material's own project", async () => {
    memberOf({ "p-1": "client" });
    anyDb.material.findUnique.mockResolvedValue({ projectId: "p-1" });
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(
      caller.update({ itemId: "m-1", name: "X" }),
      "FORBIDDEN",
    );
  });

  /**
   * REGRESSION: UpdateMaterialSchema accepted negative stock thresholds
   * (create validates min(0), update didn't) — silently corrupting stock
   * baselines that drive low-stock alerting.
   */
  it("rejects negative minStock/currentStock/reorderLevel (zod min(0) on update)", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.findUnique.mockResolvedValue({ projectId: "p-1" });
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(
      caller.update({ itemId: "m-1", minStock: -10 }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.update({ itemId: "m-1", currentStock: -1 }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.update({ itemId: "m-1", reorderLevel: -3 }),
      "BAD_REQUEST",
    );
    expect(anyDb.material.update).not.toHaveBeenCalled();
  });
});

// ─── delete ─────────────────────────────────────────────────────────────────
describe("materialCrud.delete", () => {
  it("deletes a material the caller can write to", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.findUnique.mockResolvedValue({ projectId: "p-1" });
    const caller = createCaller(materialCrudRouter, USER);
    const res = await caller.delete({ itemId: "m-1" });
    expect(res.ok).toBe(true);
    expect(anyDb.material.delete).toHaveBeenCalledWith({ where: { id: "m-1" } });
  });

  it("NOT_FOUNDs an unknown itemId", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.findUnique.mockResolvedValue(null);
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(caller.delete({ itemId: "ghost" }), "NOT_FOUND");
    expect(anyDb.material.delete).not.toHaveBeenCalled();
  });

  it("FORBIDDENs deleting a material from another project (IDOR guard)", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.findUnique.mockResolvedValue({ projectId: "p-other" });
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(caller.delete({ itemId: "m-foreign" }), "FORBIDDEN");
    expect(anyDb.material.delete).not.toHaveBeenCalled();
  });
});

// ─── checkProjectDeleteImpact ───────────────────────────────────────────────
describe("materialCrud.checkProjectDeleteImpact", () => {
  it("counts impact across transactions, PO items, BOQ ingredients and requisition items", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.findMany.mockResolvedValue([
      { id: "m-1", projectId: "p-1" },
      { id: "m-2", projectId: "p-1" },
    ]);
    anyDb.materialTransaction.count.mockResolvedValue(3);
    anyDb.purchaseOrderItem.count.mockResolvedValue(1);
    anyDb.boqIngredient.count.mockResolvedValue(0);
    anyDb.purchaseRequisitionItem.count.mockResolvedValue(0);

    const caller = createCaller(materialCrudRouter, USER);
    const res = await caller.checkProjectDeleteImpact({ itemIds: ["m-1", "m-2"] });

    expect(res.transactions).toBe(3);
    expect(res.purchaseOrderItems).toBe(1);
    expect(res.boqIngredients).toBe(0);
    expect(res.requisitionItems).toBe(0);
    expect(res.hasImpact).toBe(true);
    // counts are scoped to the VERIFIED ids
    expect(anyDb.materialTransaction.count).toHaveBeenCalledWith({
      where: { materialId: { in: ["m-1", "m-2"] } },
    });
  });

  it("reports hasImpact:false when nothing references the materials", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.findMany.mockResolvedValue([{ id: "m-1", projectId: "p-1" }]);
    const caller = createCaller(materialCrudRouter, USER);
    const res = await caller.checkProjectDeleteImpact({ itemIds: ["m-1"] });
    expect(res.hasImpact).toBe(false);
  });

  /**
   * REGRESSION (cross-tenant read, same class as catalog-v2 M-2): previously
   * ANY authenticated user could pass arbitrary material ids and learn
   * cross-tenant reference counts with no membership check at all.
   */
  it("FORBIDDENs impact probing of materials outside the caller's projects", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.findMany.mockResolvedValue([
      { id: "m-1", projectId: "p-1" },
      { id: "m-foreign", projectId: "p-other" },
    ]);
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(
      caller.checkProjectDeleteImpact({ itemIds: ["m-1", "m-foreign"] }),
      "FORBIDDEN",
    );
    expect(anyDb.materialTransaction.count).not.toHaveBeenCalled();
  });
});

// ─── deleteMany ─────────────────────────────────────────────────────────────
describe("materialCrud.deleteMany", () => {
  it("bulk-deletes after asserting write access on EVERY distinct owning project", async () => {
    memberOf({ "p-1": "engineer", "p-2": "coordinator" });
    anyDb.material.findMany.mockResolvedValue([
      { id: "m-1", projectId: "p-1" },
      { id: "m-2", projectId: "p-1" },
      { id: "m-3", projectId: "p-2" },
    ]);
    const caller = createCaller(materialCrudRouter, USER);
    const res = await caller.deleteMany({ itemIds: ["m-1", "m-2", "m-3"] });
    expect(res).toEqual({ ok: true, count: 3 });
    expect(anyDb.material.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["m-1", "m-2", "m-3"] } },
    });
  });

  it("FORBIDDENs the whole batch when any material belongs to a foreign project", async () => {
    memberOf({ "p-1": "engineer" }); // no membership in p-2
    anyDb.material.findMany.mockResolvedValue([
      { id: "m-1", projectId: "p-1" },
      { id: "m-foreign", projectId: "p-2" },
    ]);
    const caller = createCaller(materialCrudRouter, USER);
    await expectTRPCError(
      caller.deleteMany({ itemIds: ["m-1", "m-foreign"] }),
      "FORBIDDEN",
    );
    expect(anyDb.material.deleteMany).not.toHaveBeenCalled();
  });

  it("is a no-op when none of the ids exist", async () => {
    memberOf({ "p-1": "engineer" });
    anyDb.material.findMany.mockResolvedValue([]);
    const caller = createCaller(materialCrudRouter, USER);
    const res = await caller.deleteMany({ itemIds: ["ghost-1"] });
    expect(res).toEqual({ ok: true, count: 0 });
    expect(anyDb.material.deleteMany).not.toHaveBeenCalled();
  });
});

// ─── listOrgInventory ───────────────────────────────────────────────────────
describe("materialCrud.listOrgInventory", () => {
  function orgUser() {
    anyDb.user.findUnique.mockResolvedValue({ organizationId: "org-1", role: "member" });
  }

  function invMaterial(overrides: Record<string, unknown> = {}) {
    return {
      id: "m-1",
      name: "Cement",
      code: "C-01",
      category: "Cement",
      subCategory: "53 Grade",
      unit: "bags",
      currentStock: 120,
      minStock: 50,
      reorderLevel: 80,
      projectId: "p-1",
      project: { id: "p-1", name: "Bridge", code: "BR-1" },
      transactions: [{ rate: 950, date: new Date("2026-08-01") }],
      ...overrides,
    };
  }

  it("scopes inventory to the caller's org through the project relation", async () => {
    orgUser();
    anyDb.material.findMany.mockResolvedValue([invMaterial()]);
    const caller = createCaller(materialCrudRouter, USER);
    const res = await caller.listOrgInventory({});

    expect(anyDb.material.findMany.mock.calls[0][0].where).toEqual({
      project: { organizationId: "org-1" },
      resourceType: "material",
    });
    expect(anyDb.project.findMany.mock.calls[0][0].where).toEqual({
      organizationId: "org-1",
      status: "active",
    });
    expect(res.inventory[0]).toEqual(
      expect.objectContaining({
        name: "Cement",
        projectName: "Bridge",
        projectCode: "BR-1",
        currentStock: 120,
        lastRate: 950,
        lastDeliveredDate: new Date("2026-08-01"),
      }),
    );
  });

  it("applies the projectId filter unless 'all'", async () => {
    orgUser();
    anyDb.material.findMany.mockResolvedValue([]);
    const caller = createCaller(materialCrudRouter, USER);
    await caller.listOrgInventory({ projectId: "p-1" });
    expect(anyDb.material.findMany.mock.calls[0][0].where).toEqual({
      project: { organizationId: "org-1" },
      resourceType: "material",
      projectId: "p-1",
    });

    await caller.listOrgInventory({ projectId: "all" });
    expect(anyDb.material.findMany.mock.calls[1][0].where).toEqual({
      project: { organizationId: "org-1" },
      resourceType: "material",
    });
  });

  it("returns empty for a user without an organization", async () => {
    anyDb.user.findUnique.mockResolvedValue({ organizationId: null, role: "member" });
    const caller = createCaller(materialCrudRouter, USER);
    const res = await caller.listOrgInventory({});
    expect(res).toEqual({ inventory: [], projects: [] });
    expect(anyDb.material.findMany).not.toHaveBeenCalled();
  });

  it("defaults category/subCategory/lastRate when the material has no history", async () => {
    orgUser();
    anyDb.material.findMany.mockResolvedValue([
      invMaterial({ category: null, subCategory: null, transactions: [] }),
    ]);
    const caller = createCaller(materialCrudRouter, USER);
    const res = await caller.listOrgInventory({});
    expect(res.inventory[0].category).toBe("General Materials");
    expect(res.inventory[0].subCategory).toBe("");
    expect(res.inventory[0].lastRate).toBe(0);
    expect(res.inventory[0].lastDeliveredDate).toBeNull();
  });
});
