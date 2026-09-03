/**
 * Router-layer tests for rate-profile.ts — pins the audit C-1 fix.
 *
 * RateProfile/RateProfileItem/BoqIngredient are child tables with NO
 * organizationId/projectId column and NO RLS coverage. Every mutation
 * must therefore resolve the parent profile (or item, or analysis) scoped
 * to input.projectId before touching rows by raw cuid — otherwise any
 * authenticated user who can write any project could modify or delete
 * another organization's vendor rate data by guessing cuids.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { rateProfileRouter } from "../rate-profile";

const anyDb = db as any;
const USER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── C-1: cross-tenant IDOR pins ─────────────────────────────────────────────
describe("rate-profile ownership guards (C-1)", () => {
  it("addItem NOT_FOUNDs a profile from another project (no create)", async () => {
    member("engineer");
    anyDb.rateProfile.findFirst.mockResolvedValue(null); // profile not in caller's project
    const caller = createCaller(rateProfileRouter, USER);
    await expectTRPCError(
      caller.addItem({ projectId: "p-1", profileId: "foreign-profile", materialName: "Cement", rate: 100 }),
      "NOT_FOUND",
    );
    expect(anyDb.rateProfileItem.create).not.toHaveBeenCalled();
  });

  it("addItem creates when the profile belongs to the project", async () => {
    member("engineer");
    anyDb.rateProfile.findFirst.mockResolvedValue({ id: "profile-1" });
    const caller = createCaller(rateProfileRouter, USER);
    await caller.addItem({ projectId: "p-1", profileId: "profile-1", materialName: "Cement", rate: 100 });
    expect(anyDb.rateProfileItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rateProfileId: "profile-1" }) }),
    );
  });

  it("updateItem NOT_FOUNDs an item whose profile is in another project", async () => {
    member("engineer");
    anyDb.rateProfileItem.findFirst.mockResolvedValue(null); // item not under caller's project's profile
    const caller = createCaller(rateProfileRouter, USER);
    await expectTRPCError(
      caller.updateItem({ projectId: "p-1", profileId: "profile-1", itemId: "foreign-item", rate: 1 }),
      "NOT_FOUND",
    );
    expect(anyDb.rateProfileItem.update).not.toHaveBeenCalled();
  });

  it("updateItem scopes the lookup to profileId + project (join guard)", async () => {
    member("engineer");
    anyDb.rateProfileItem.findFirst.mockResolvedValue({ id: "item-1" });
    const caller = createCaller(rateProfileRouter, USER);
    await caller.updateItem({ projectId: "p-1", profileId: "profile-1", itemId: "item-1", rate: 55 });
    expect(anyDb.rateProfileItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1", rateProfileId: "profile-1", rateProfile: { projectId: "p-1" } },
      }),
    );
    expect(anyDb.rateProfileItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "item-1" } }),
    );
  });

  it("deleteItem NOT_FOUNDs a foreign item (no delete)", async () => {
    member("engineer");
    anyDb.rateProfileItem.findFirst.mockResolvedValue(null);
    const caller = createCaller(rateProfileRouter, USER);
    await expectTRPCError(
      caller.deleteItem({ projectId: "p-1", profileId: "profile-1", itemId: "foreign-item" }),
      "NOT_FOUND",
    );
    expect(anyDb.rateProfileItem.delete).not.toHaveBeenCalled();
  });

  it("addAveragedItem verifies profile ownership before creating", async () => {
    member("engineer");
    anyDb.rateProfile.findFirst.mockResolvedValue(null);
    const caller = createCaller(rateProfileRouter, USER);
    await expectTRPCError(
      caller.addAveragedItem({
        projectId: "p-1", profileId: "foreign", materialName: "Steel",
        rate1: 10, rate2: 20,
      }),
      "NOT_FOUND",
    );
    expect(anyDb.rateProfileItem.create).not.toHaveBeenCalled();
  });

  it("batchApply NOT_FOUNDs a rate analysis from another project (no ingredient rewrite)", async () => {
    member("engineer");
    anyDb.rateProfile.findFirst.mockResolvedValue({ id: "profile-1", name: "P", items: [] });
    anyDb.rateAnalysis.findFirst.mockResolvedValue(null); // analysis not in caller's project
    const caller = createCaller(rateProfileRouter, USER);
    await expectTRPCError(
      caller.batchApply({ projectId: "p-1", profileId: "profile-1", rateAnalysisId: "foreign-analysis" }),
      "NOT_FOUND",
    );
    expect(anyDb.boqIngredient.findMany).not.toHaveBeenCalled();
    expect(anyDb.boqIngredient.update).not.toHaveBeenCalled();
  });

  it("batchApply joins the analysis through boqItem.projectId", async () => {
    member("engineer");
    anyDb.rateProfile.findFirst.mockResolvedValue({
      id: "profile-1", name: "P",
      items: [{ id: "ri-1", materialName: "Cement", unit: "bag", rate: 500 }],
    });
    anyDb.rateAnalysis.findFirst.mockResolvedValue({ id: "analysis-1" });
    anyDb.boqIngredient.findMany.mockResolvedValue([
      { id: "ing-1", name: "Cement", rate: 400, unit: "bag", calcMode: "fixed", quantity: 10, percentage: 0, amount: 4000 },
    ]);
    const caller = createCaller(rateProfileRouter, USER);
    const res = await caller.batchApply({ projectId: "p-1", profileId: "profile-1", rateAnalysisId: "analysis-1" });

    expect(anyDb.rateAnalysis.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "analysis-1", boqItem: { projectId: "p-1" } },
      }),
    );
    expect(res.updated).toBe(1);
  });
});

// ─── Authorization ───────────────────────────────────────────────────────────
describe("rate-profile authorization", () => {
  it("list FORBIDDENs non-project-members", async () => {
    member(null);
    const caller = createCaller(rateProfileRouter, USER);
    await expectTRPCError(caller.list({ projectId: "p-1" }), "FORBIDDEN");
  });

  it("create FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(rateProfileRouter, USER);
    await expectTRPCError(
      caller.create({ projectId: "p-1", name: "District Rates 2026" }),
      "FORBIDDEN",
    );
    expect(anyDb.rateProfile.create).not.toHaveBeenCalled();
  });
});
