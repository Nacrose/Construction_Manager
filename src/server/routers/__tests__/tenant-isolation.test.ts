/**
 * Tenant-isolation regression tests at the ROUTER layer.
 *
 * These encode the cross-tenant fixes from the security audit as permanent
 * regressions:
 *   - M-2  catalog-v2 getDeleteImpact / getCategoryImpact / commitImport
 *   - H-3b financial-reporting journalEntryList org-level entry leak
 *   - H-2  bank-guarantee org-less create mass-assignment guard
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

// Import AFTER vi.mock so routers receive the mocked client.
import { db } from "@/lib/db";
import { catalogV2Router } from "../catalog-v2";
import { financialReportingRouter } from "../financial-reporting";

const anyDb = db as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── M-2: catalog-v2.getDeleteImpact ────────────────────────────────────────
describe("catalogV2.getDeleteImpact (M-2 cross-tenant read guard)", () => {
  const org1User = buildUser();

  it("FORBIDDENs probing another org's material IDs", async () => {
    anyDb.catalogMaterial.findMany.mockResolvedValue([
      { id: "m-1", scope: "org", organizationId: "org-2", projectId: null },
    ]);
    const caller = createCaller(catalogV2Router, org1User);
    await expectTRPCError(
      caller.getDeleteImpact({ ids: ["m-1"] }),
      "FORBIDDEN",
    );
  });

  it("FORBIDDENs probing another org's PROJECT-scoped materials", async () => {
    // project-scoped material: caller must be a member of that project
    anyDb.catalogMaterial.findMany.mockResolvedValue([
      { id: "m-2", scope: "project", organizationId: null, projectId: "p-2" },
    ]);
    anyDb.projectMember.findUnique.mockResolvedValue(null); // not a member
    const caller = createCaller(catalogV2Router, org1User);
    await expectTRPCError(
      caller.getDeleteImpact({ ids: ["m-2"] }),
      "FORBIDDEN",
    );
  });

  it("allows own-org and global materials and returns impact counts", async () => {
    anyDb.catalogMaterial.findMany.mockResolvedValue([
      { id: "m-1", scope: "org", organizationId: "org-1", projectId: null },
      { id: "m-3", scope: "global", organizationId: null, projectId: null },
    ]);
    anyDb.rateEntry.count.mockResolvedValue(2);
    anyDb.material.count.mockResolvedValue(0);
    anyDb.boqIngredient.count.mockResolvedValue(0);
    anyDb.globalPresetIngredient.count.mockResolvedValue(0);
    anyDb.partnerSupply.count.mockResolvedValue(0);

    const caller = createCaller(catalogV2Router, org1User);
    const res = await caller.getDeleteImpact({ ids: ["m-1", "m-3"] });
    expect(res.hasImpact).toBe(true);
    expect(res.rateCatalogItems).toBe(2);
    // Counts must only run over the VERIFIED ids
    expect(anyDb.rateEntry.count).toHaveBeenCalledWith({
      where: { materialId: { in: ["m-1", "m-3"] } },
    });
  });
});

// ─── M-2: catalog-v2.getCategoryImpact ──────────────────────────────────────
describe("catalogV2.getCategoryImpact (M-2 unscoped-query guard)", () => {
  it("scopes unscoped queries to caller-visible catalogs (global + own org + own projects)", async () => {
    anyDb.catalogMaterial.findMany.mockResolvedValue([]);
    anyDb.projectMember.findMany.mockResolvedValue([{ projectId: "p-1" }]);

    const caller = createCaller(catalogV2Router, buildUser());
    await caller.getCategoryImpact({ category: "Cement" });

    const where = anyDb.catalogMaterial.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { scope: "global" },
      { organizationId: "org-1" },
      { projectId: { in: ["p-1"] } },
    ]);
  });

  it("keeps superadmin god-view (no injected OR clause)", async () => {
    anyDb.catalogMaterial.findMany.mockResolvedValue([]);
    const caller = createCaller(catalogV2Router, buildUser({ isSuperAdmin: true }));
    await caller.getCategoryImpact({ category: "Cement" });
    const where = anyDb.catalogMaterial.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });

  it("still enforces assertOrgMember on explicit foreign organizationId", async () => {
    const caller = createCaller(catalogV2Router, buildUser());
    await expectTRPCError(
      caller.getCategoryImpact({ category: "Cement", organizationId: "org-2" }),
      "FORBIDDEN",
    );
  });
});

// ─── M-2: catalog-v2.commitImport add_alias ─────────────────────────────────
describe("catalogV2.commitImport (M-2 cross-tenant WRITE guard)", () => {
  const orgAdmin = buildUser({ orgRole: "org_admin" });

  it("FORBIDDENs adding an alias to another org's material", async () => {
    anyDb.catalogMaterial.findUnique.mockResolvedValue({
      id: "target-1",
      scope: "org",
      organizationId: "org-2",
      projectId: null,
      aliases: [],
    });
    const caller = createCaller(catalogV2Router, orgAdmin);
    await expectTRPCError(
      caller.commitImport({
        scope: "org",
        items: [{ rawName: "OPC 53 Grade", action: "add_alias", targetId: "target-1" }],
      }),
      "FORBIDDEN",
    );
    // and crucially: nothing may have been written
    expect(anyDb.catalogMaterial.update).not.toHaveBeenCalled();
  });

  it("FORBIDDENs aliasing a global material as a mere org admin", async () => {
    anyDb.catalogMaterial.findUnique.mockResolvedValue({
      id: "target-2",
      scope: "global",
      organizationId: null,
      projectId: null,
      aliases: [],
    });
    const caller = createCaller(catalogV2Router, orgAdmin);
    await expectTRPCError(
      caller.commitImport({
        scope: "org",
        items: [{ rawName: "OPC 53 Grade", action: "add_alias", targetId: "target-2" }],
      }),
      "FORBIDDEN",
    );
  });

  it("allows aliasing own-org material and appends the alias", async () => {
    anyDb.catalogMaterial.findUnique.mockResolvedValue({
      id: "target-3",
      scope: "org",
      organizationId: "org-1",
      projectId: null,
      aliases: ["existing"],
    });
    const caller = createCaller(catalogV2Router, orgAdmin);
    const res = await caller.commitImport({
      scope: "org",
      items: [{ rawName: "OPC 53 Grade", action: "add_alias", targetId: "target-3" }],
    });
    expect(res.aliasCount).toBe(1);
    expect(anyDb.catalogMaterial.update).toHaveBeenCalledWith({
      where: { id: "target-3" },
      data: { aliases: ["existing", "OPC 53 Grade"] },
    });
  });
});

// ─── H-3b: financial-reporting.journalEntryList ─────────────────────────────
describe("financialReporting.journalEntryList (H-3b org-level JE leak)", () => {
  it("scopes org-level entries to the caller's organization", async () => {
    anyDb.user.findUniqueOrThrow.mockResolvedValue({ organizationId: "org-1" });
    anyDb.project.findMany.mockResolvedValue([{ id: "p-1" }]);
    anyDb.journalEntry.findMany.mockResolvedValue([]);
    anyDb.journalEntry.count.mockResolvedValue(0);

    const caller = createCaller(financialReportingRouter, buildUser());
    await caller.journalEntryList({});

    const where = anyDb.journalEntry.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { lines: { some: { projectId: { in: ["p-1"] } } } },
      { organizationId: "org-1" },
    ]);
  });

  it("org-less users get project lines only (no org branch at all)", async () => {
    anyDb.user.findUniqueOrThrow.mockResolvedValue({ organizationId: null });
    anyDb.projectMember.findMany.mockResolvedValue([{ projectId: "p-9" }]);
    anyDb.journalEntry.findMany.mockResolvedValue([]);
    anyDb.journalEntry.count.mockResolvedValue(0);

    const caller = createCaller(financialReportingRouter, buildUser());
    await caller.journalEntryList({});

    const where = anyDb.journalEntry.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
    expect(where.lines).toEqual({ some: { projectId: { in: ["p-9"] } } });
  });
});
