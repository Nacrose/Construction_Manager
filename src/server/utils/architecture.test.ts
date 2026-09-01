import { describe, it, expect, vi } from "vitest";
import { assertOrgBankAccount } from "@/lib/authz";
import { clientIpcWhere, subcontractorIpcWhere } from "@/server/utils/financial-scopes";
import { DEFAULT_DELEGATION_RULES, type OperatingModel, type DelegationAction } from "@/lib/delegation";
import { getAuthSecret, COOKIE_NAME } from "@/lib/auth-config";

describe("Architectural Invariants & SSOT Propagation Suite", () => {
  describe("1. Multi-Tenant Bank Account Security Choke Point", () => {
    it("throws FORBIDDEN when user has no organizationId", async () => {
      await expect(
        assertOrgBankAccount("bank-123", null as any)
      ).rejects.toThrow("User has no organization assigned.");
    });

    it("throws FORBIDDEN when bank account belongs to another organization (IDOR prevention)", async () => {
      const mockTx = {
        companyBankAccount: {
          findUnique: vi.fn().mockResolvedValue({
            id: "bank-target",
            organizationId: "org-victim",
            currentBalance: 500000,
            name: "Victim Org Central Account",
          }),
        },
      };

      await expect(
        assertOrgBankAccount("bank-target", "org-attacker", mockTx as any)
      ).rejects.toThrow("Bank account not found in your organization.");
    });

    it("throws FORBIDDEN when bank account does not exist", async () => {
      const mockTx = {
        companyBankAccount: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(
        assertOrgBankAccount("non-existent", "org-1", mockTx as any)
      ).rejects.toThrow("Bank account not found in your organization.");
    });

    it("returns bank account successfully when organizationId matches", async () => {
      const mockTx = {
        companyBankAccount: {
          findUnique: vi.fn().mockResolvedValue({
            id: "bank-1",
            organizationId: "org-1",
            currentBalance: 120000,
            name: "Nabil Bank Main",
          }),
        },
      };

      const result = await assertOrgBankAccount("bank-1", "org-1", mockTx as any);
      expect(result.id).toBe("bank-1");
      expect(result.currentBalance).toBe(120000);
    });
  });

  describe("2. Canonical IPC Domain Scoping Builders", () => {
    it("clientIpcWhere strictly enforces subcontractorId: null (Revenue/Inflow scoping)", () => {
      const filterSingle = clientIpcWhere({ projectId: "proj-1", status: "certified" });
      expect(filterSingle.subcontractorId).toBeNull();
      expect(filterSingle.projectId).toBe("proj-1");
      expect(filterSingle.status).toBe("certified");

      const filterMulti = clientIpcWhere({ projectIds: ["p1", "p2"], status: ["certified", "paid"] });
      expect(filterMulti.subcontractorId).toBeNull();
      expect(filterMulti.projectId).toEqual({ in: ["p1", "p2"] });
      expect(filterMulti.status).toEqual({ in: ["certified", "paid"] });
    });

    it("subcontractorIpcWhere strictly enforces subcontractorId: { not: null } (Liability/Outflow scoping)", () => {
      const filter = subcontractorIpcWhere({ projectId: "proj-1" });
      expect(filter.subcontractorId).toEqual({ not: null });
      expect(filter.projectId).toBe("proj-1");
    });
  });

  describe("3. Operating Model Financial Delegation Completeness", () => {
    const allActions: DelegationAction[] = [
      "create_payment",
      "bulk_create_payments",
      "create_vendor_bill",
      "record_vendor_payment",
      "create_subcontractor_bill",
      "mark_subcontractor_paid",
      "create_purchase_order",
      "create_site_expense",
      "approve_site_expense",
      "settle_multi_bill",
      "create_bank_account",
      "create_head_office_expense",
      "release_retention",
      "record_jv_payout",
      "log_direct_material_purchase",
    ];

    const operatingModels: OperatingModel[] = [
      "hq_centralized_imprest",
      "hybrid_daybook_hq_procure",
      "decentralized_site_and_hq",
      "single_project_jv",
    ];

    for (const model of operatingModels) {
      it(`defines default delegation rules for all financial actions in operating model: ${model}`, () => {
        const rules = DEFAULT_DELEGATION_RULES[model];
        expect(rules).toBeDefined();
        const coveredActions = new Set(rules.map((r) => r.action));

        for (const action of allActions) {
          expect(
            coveredActions.has(action),
            `Action '${action}' must be defined in DEFAULT_DELEGATION_RULES for model '${model}'`
          ).toBe(true);
        }
      });
    }
  });

  describe("4. Edge-Safe Authentication Configuration", () => {
    it("exports standard cookie name", () => {
      expect(COOKIE_NAME).toBe("cf_session");
    });

    it("resolves a Uint8Array secret in development", () => {
      const secret = getAuthSecret();
      expect(secret).toBeInstanceOf(Uint8Array);
      expect(secret.length).toBeGreaterThan(0);
    });

    it("throws a loud fatal error in production if AUTH_SECRET is missing", () => {
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.AUTH_SECRET;
      try {
        (process.env as any).NODE_ENV = "production";
        delete process.env.AUTH_SECRET;
        delete process.env.NEXT_PHASE;
        expect(() => getAuthSecret()).toThrow("[FATAL] AUTH_SECRET");
      } finally {
        (process.env as any).NODE_ENV = origEnv;
        if (origSecret) process.env.AUTH_SECRET = origSecret;
      }
    });

    it("throws a loud fatal error in production if AUTH_SECRET is too short (< 32 chars)", () => {
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.AUTH_SECRET;
      try {
        (process.env as any).NODE_ENV = "production";
        process.env.AUTH_SECRET = "too-short-secret";
        delete process.env.NEXT_PHASE;
        expect(() => getAuthSecret()).toThrow("too short");
      } finally {
        (process.env as any).NODE_ENV = origEnv;
        if (origSecret) process.env.AUTH_SECRET = origSecret;
      }
    });
  });

  describe("5. Central Security Control Plane Policy Procedures", () => {
    it("exports declarative security procedure factories", async () => {
      const trpc = await import("@/server/trpc");
      expect(trpc.orgAdminProcedure).toBeDefined();
      expect(trpc.superAdminProcedure).toBeDefined();
      expect(trpc.projectProcedure).toBeDefined();
      expect(trpc.financialProcedure).toBeDefined();
    });

    it("projectProcedure factory returns a callable tRPC procedure with role middleware", async () => {
      const { projectProcedure } = await import("@/server/trpc");
      const proc = projectProcedure("write");
      expect(proc).toBeDefined();
      expect(typeof proc.input).toBe("function");
    });

    it("financialProcedure factory accepts valid DelegationActions and returns procedure", async () => {
      const { financialProcedure } = await import("@/server/trpc");
      const proc = financialProcedure("record_jv_payout");
      expect(proc).toBeDefined();
      expect(typeof proc.input).toBe("function");
    });
  });
});
