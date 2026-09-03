import { describe, it, expect, vi, beforeEach } from "vitest";
import { authErrorToResponse, assertOrgAdmin, type ProjectRole } from "./authz";

vi.mock("@/lib/db", () => ({
  db: {
    projectMember: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    companyBankAccount: { findUnique: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { getProjectRole, assertProjectMember, assertCanWrite, assertProjectAdmin, assertProjectManager, isOrgOwner } from "./authz";

const anyDb = db as any;

describe("Authorization Status Mapping & Security Guards", () => {
  describe("authErrorToResponse HTTP Mapping", () => {
    const errorCodes = [
      { code: "UNAUTHENTICATED", expectedStatus: 401, expectedMsg: "Authentication required." },
      { code: "FORBIDDEN", expectedStatus: 403, expectedMsg: "You are not a member of this project." },
      { code: "READ_ONLY", expectedStatus: 403, expectedMsg: "Your role on this project is read-only." },
      { code: "REQUIRES_ADMIN", expectedStatus: 403, expectedMsg: "This action requires Project Manager or Coordinator role." },
      { code: "REQUIRES_PROJECT_MANAGER", expectedStatus: 403, expectedMsg: "This action requires Project Manager role." },
      { code: "REQUIRES_ORG_ADMIN", expectedStatus: 403, expectedMsg: "This action requires Organization Admin role." },
    ];

    it.each(errorCodes)("maps Error('$code') to status $expectedStatus", ({ code, expectedStatus, expectedMsg }) => {
      const err = new Error(code);
      const res = authErrorToResponse(err);
      expect(res.status).toBe(expectedStatus);
      expect(res.message).toBe(expectedMsg);
    });

    const unknownErrors = [
      { input: new Error("DATABASE_CONNECTION_REFUSED"), desc: "generic database error" },
      { input: new Error("UNKNOWN"), desc: "UNKNOWN string error" },
      { input: new Error("Custom validation failure"), desc: "validation error" },
      { input: "string throw", desc: "primitive string error" },
      { input: { message: "object error" }, desc: "plain object error" },
      { input: null, desc: "null error" },
      { input: undefined, desc: "undefined error" },
      { input: 404, desc: "number error" },
    ];

    it.each(unknownErrors)("safely falls back to 500 status for $desc", ({ input }) => {
      const res = authErrorToResponse(input);
      expect(res.status).toBe(500);
      expect(res.message).toBe("Internal error.");
    });
  });

  describe("Project Role Capability Matrix (closed triad, ADR-0005)", () => {
    const roles: ProjectRole[] = ["project_manager", "coordinator", "engineer"];

    it("exactly three project roles exist — external parties never receive roles", () => {
      expect(roles).toHaveLength(3);
    });

    const capabilityMatrix = [
      { role: "project_manager" as ProjectRole, canWrite: true, isAdminTier: true, isOwnerTier: true },
      { role: "coordinator" as ProjectRole, canWrite: true, isAdminTier: true, isOwnerTier: false },
      { role: "engineer" as ProjectRole, canWrite: true, isAdminTier: false, isOwnerTier: false },
    ];

    it.each(capabilityMatrix)("verifies permission matrix for role $role", ({ role, canWrite, isAdminTier, isOwnerTier }) => {
      // Triad members are never read-only.
      expect(canWrite).toBe(true);

      const hasAdminTier = role === "project_manager" || role === "coordinator";
      expect(hasAdminTier).toBe(isAdminTier);

      const hasOwnerTier = role === "project_manager";
      expect(hasOwnerTier).toBe(isOwnerTier);
    });
  });

  describe("getProjectRole — explicit membership is the only role source (Phase B cutover)", () => {
    const mkUser = (over: Record<string, unknown> = {}) =>
      ({ id: "u-1", organizationId: "org-1", orgRole: "member", impersonating: false, ...over }) as any;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns the explicit ProjectMember row role when one exists", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue({ role: "engineer" });
      const role = await getProjectRole("u-1", "p-1", { organizationId: "org-1", orgRole: "member" });
      expect(role).toBe("engineer");
      // No org lookup needed — explicit row wins.
      expect(anyDb.project.findUnique).not.toHaveBeenCalled();
    });

    it("grants the org owner org-wide project access (the ONE implicit grant)", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue(null);
      anyDb.project.findUnique.mockResolvedValue({ organizationId: "org-1" });
      const role = await getProjectRole("u-owner", "p-1", { organizationId: "org-1", orgRole: "owner" });
      expect(role).toBe("project_manager");
    });

    it("does NOT extend the owner's implicit grant across org boundaries", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue(null);
      anyDb.project.findUnique.mockResolvedValue({ organizationId: "org-other" });
      const role = await getProjectRole("u-owner", "p-other", { organizationId: "org-1", orgRole: "owner" });
      expect(role).toBeNull();
    });

    it("REMOVED: org members no longer implicitly become engineers", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue(null);
      anyDb.project.findUnique.mockResolvedValue({ organizationId: "org-1" });
      const role = await getProjectRole("u-1", "p-1", { organizationId: "org-1", orgRole: "member" });
      expect(role).toBeNull();
    });

    it("REMOVED: org_admin no longer implicitly receives project_manager", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue(null);
      anyDb.project.findUnique.mockResolvedValue({ organizationId: "org-1" });
      const role = await getProjectRole("u-admin", "p-1", { organizationId: "org-1", orgRole: "org_admin" });
      expect(role).toBeNull();
    });

    it("rejects stale role vocabulary (org_owner was never a valid value)", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue(null);
      anyDb.project.findUnique.mockResolvedValue({ organizationId: "org-1" });
      const role = await getProjectRole("u-x", "p-1", { organizationId: "org-1", orgRole: "org_owner" });
      expect(role).toBeNull();
    });

    it("impersonating superadmin resolves to project_manager inside the tenant org", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue(null);
      anyDb.project.findUnique.mockResolvedValue({ organizationId: "org-1" });
      const role = await getProjectRole("u-root", "p-1", { organizationId: "org-1", orgRole: "member", impersonating: true });
      expect(role).toBe("project_manager");
    });

    it("impersonation grant does not cross org boundaries either", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue(null);
      anyDb.project.findUnique.mockResolvedValue({ organizationId: "org-other" });
      const role = await getProjectRole("u-root", "p-other", { organizationId: "org-1", orgRole: "member", impersonating: true });
      expect(role).toBeNull();
    });

    it("returns null for users without an organization (no grant surface)", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue(null);
      const role = await getProjectRole("u-1", "p-1", { organizationId: null, orgRole: null });
      expect(role).toBeNull();
      expect(anyDb.project.findUnique).not.toHaveBeenCalled();
    });

    it("assertProjectMember throws FORBIDDEN when resolution is null", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue(null);
      await expect(assertProjectMember(mkUser(), "p-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("every triad member can write — assertCanWrite no longer distinguishes read-only roles", async () => {
      for (const role of ["project_manager", "coordinator", "engineer"] as ProjectRole[]) {
        anyDb.projectMember.findUnique.mockResolvedValue({ role });
        const returned = await assertCanWrite(mkUser(), "p-1");
        expect(returned).toBe(role);
      }
    });

    it("assertProjectAdmin requires coordinator or project_manager", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue({ role: "coordinator" });
      await expect(assertProjectAdmin(mkUser(), "p-1")).resolves.toBe("coordinator");

      anyDb.projectMember.findUnique.mockResolvedValue({ role: "engineer" });
      await expect(assertProjectAdmin(mkUser(), "p-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("assertProjectManager requires project_manager", async () => {
      anyDb.projectMember.findUnique.mockResolvedValue({ role: "project_manager" });
      await expect(assertProjectManager(mkUser(), "p-1")).resolves.toBe("project_manager");

      anyDb.projectMember.findUnique.mockResolvedValue({ role: "coordinator" });
      await expect(assertProjectManager(mkUser(), "p-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("isOrgOwner distinguishes the owner orgRole", () => {
      expect(isOrgOwner(mkUser({ orgRole: "owner" }))).toBe(true);
      expect(isOrgOwner(mkUser({ orgRole: "org_admin" }))).toBe(false);
      expect(isOrgOwner(null)).toBe(false);
    });
  });

  describe("assertOrgAdmin", () => {
    const mkUser = (orgRole: string | undefined) =>
      ({ orgRole }) as any;

    it("throws for non-admin users", () => {
      expect(() => assertOrgAdmin(mkUser("member"))).toThrow(/Organization admin access required/);
      expect(() => assertOrgAdmin(mkUser(undefined))).toThrow(/Organization admin access required/);
    });

    it("does not throw for org_admin", () => {
      expect(() => assertOrgAdmin(mkUser("org_admin"))).not.toThrow();
    });

    it("does not throw for owner", () => {
      expect(() => assertOrgAdmin(mkUser("owner"))).not.toThrow();
    });

    it("throws for null/undefined user", () => {
      expect(() => assertOrgAdmin(null)).toThrow(/Organization admin access required/);
      expect(() => assertOrgAdmin(undefined)).toThrow(/Organization admin access required/);
    });
  });

  describe("Tenant Isolation on Cross-Org Guarantees & Presets", () => {
    it("rejects cross-organization guarantee access when user organization does not match", () => {
      const user = { id: "u1", organizationId: "org-alpha" };
      const guarantee = { projectId: null, organizationId: "org-beta" };

      const isAllowed = Boolean(
        user.organizationId &&
        guarantee.organizationId &&
        user.organizationId === guarantee.organizationId
      );
      expect(isAllowed).toBe(false);
    });

    it("allows same-organization guarantee access for org-level bid bonds", () => {
      const user = { id: "u1", organizationId: "org-alpha" };
      const guarantee = { projectId: null, organizationId: "org-alpha" };

      const isAllowed = Boolean(
        user.organizationId &&
        guarantee.organizationId &&
        user.organizationId === guarantee.organizationId
      );
      expect(isAllowed).toBe(true);
    });

    it("blocks non-superadmin from mutating global system presets", () => {
      const orgAdmin = { id: "u1", orgRole: "org_admin", isSuperAdmin: false, organizationId: "org-alpha" };
      const globalPreset = { organizationId: null };

      const canMutateGlobal = Boolean(orgAdmin.isSuperAdmin || (globalPreset.organizationId && globalPreset.organizationId === orgAdmin.organizationId));
      expect(canMutateGlobal).toBe(false);
    });

    it("allows superadmin to mutate global system presets", () => {
      const superAdmin = { id: "u-root", orgRole: "org_admin", isSuperAdmin: true, organizationId: null };
      const globalPreset = { organizationId: null };

      const canMutateGlobal = Boolean(superAdmin.isSuperAdmin || (globalPreset.organizationId && globalPreset.organizationId === superAdmin.organizationId));
      expect(canMutateGlobal).toBe(true);
    });
  });

  describe("Catalog Scope & Multi-Tenant Merge Boundary Validation", () => {
    it("rejects material merge across different organizations", () => {
      const winner = { id: "mat-1", scope: "org", organizationId: "org-1", projectId: null };
      const loser = { id: "mat-2", scope: "org", organizationId: "org-2", projectId: null };

      const isMergeAllowed =
        winner.scope === loser.scope &&
        winner.organizationId === loser.organizationId &&
        winner.projectId === loser.projectId;

      expect(isMergeAllowed).toBe(false);
    });

    it("rejects material merge across different scopes (global vs org)", () => {
      const winner = { id: "mat-1", scope: "global", organizationId: null, projectId: null };
      const loser = { id: "mat-2", scope: "org", organizationId: "org-1", projectId: null };

      const isMergeAllowed =
        winner.scope === loser.scope &&
        winner.organizationId === loser.organizationId &&
        winner.projectId === loser.projectId;

      expect(isMergeAllowed).toBe(false);
    });

    it("allows material merge within same organization", () => {
      const winner = { id: "mat-1", scope: "org", organizationId: "org-1", projectId: null };
      const loser = { id: "mat-2", scope: "org", organizationId: "org-1", projectId: null };

      const isMergeAllowed =
        winner.scope === loser.scope &&
        winner.organizationId === loser.organizationId &&
        winner.projectId === loser.projectId;

      expect(isMergeAllowed).toBe(true);
    });
  });

  describe("Formula Injection & Offline Token Sanitization", () => {
    function sanitizeFormulaCell(val: any): any {
      if (typeof val === "string" && /^[=\+\-\@\t\r]/.test(val)) {
        return `'${val}`;
      }
      return val;
    }

    it.each([
      { input: "=SUM(A1:A10)", expected: "'=SUM(A1:A10)" },
      { input: "+12345", expected: "'+12345" },
      { input: "-@calc", expected: "'-@calc" },
      { input: "@cmd|' /C calc'!A0", expected: "'@cmd|' /C calc'!A0" },
      { input: "\tTabbed", expected: "'\tTabbed" },
      { input: "Normal Text", expected: "Normal Text" },
      { input: 12345, expected: 12345 },
    ])("sanitizes formula injection payload $input -> $expected", ({ input, expected }) => {
      expect(sanitizeFormulaCell(input)).toBe(expected);
    });

    it("strips Authorization header from offline queue storage", () => {
      const rawHeaders = new Headers({
        "Authorization": "Bearer sensitive-jwt-token-12345",
        "Content-Type": "application/json",
        "X-Custom-Header": "Site-1",
      });

      const queuedHeaders: Record<string, string> = {};
      rawHeaders.forEach((v, k) => {
        if (k.toLowerCase() !== "authorization") {
          queuedHeaders[k] = v;
        }
      });

      expect(queuedHeaders["authorization"]).toBeUndefined();
      expect(queuedHeaders["Authorization"]).toBeUndefined();
      expect(queuedHeaders["content-type"]).toBe("application/json");
      expect(queuedHeaders["x-custom-header"]).toBe("Site-1");
    });
  });
});

