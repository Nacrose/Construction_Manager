import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { assertOrgBankAccount } from "@/lib/authz";
import { clientIpcWhere, subcontractorIpcWhere } from "@/server/utils/financial-scopes";
import {
  METHOD_CAPABILITY_DEFAULTS,
  OPERATING_METHODS,
  capabilitiesSchema,
  methodDefaults,
  parseCapabilities,
} from "@/lib/capabilities";
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

  describe("3. Operating Capability Map Completeness (ADR-0004)", () => {
    it("defines defaults for exactly the three operating methods", () => {
      expect(Object.keys(METHOD_CAPABILITY_DEFAULTS).sort()).toEqual([...OPERATING_METHODS].sort());
    });

    it("owner_led defaults match the ADR-0004 §4 literal", () => {
      // Quoted verbatim from the ADR: procurementChain none,
      // inventoryControl none, gateRegister off, financeReview
      // owner_recorded, directPurchase on, directExpense on,
      // workforcePlanning on.
      expect(METHOD_CAPABILITY_DEFAULTS.owner_led).toEqual({
        procurementChain: "none",
        inventoryControl: "none",
        gateRegister: false,
        financeReview: "owner_recorded",
        directPurchase: true,
        directExpense: true,
        workforcePlanning: true,
      });
    });

    it("every method default is a valid, complete capability map", () => {
      for (const method of OPERATING_METHODS) {
        const parsed = capabilitiesSchema.safeParse(METHOD_CAPABILITY_DEFAULTS[method]);
        expect(parsed.success, `method ${method} must satisfy the capability schema`).toBe(true);
      }
    });

    it("direct purchase, direct expense and workforce planning are first-class in every method", () => {
      // Product principles: direct purchase/expense are first-class
      // citizens; payroll exists at every org size.
      for (const method of OPERATING_METHODS) {
        const caps = methodDefaults(method);
        expect(caps.directPurchase, `${method}.directPurchase`).toBe(true);
        expect(caps.directExpense, `${method}.directExpense`).toBe(true);
        expect(caps.workforcePlanning, `${method}.workforcePlanning`).toBe(true);
      }
    });

    it("methodDefaults fails loud on unknown methods; parseCapabilities fails loud on malformed maps", () => {
      expect(() => methodDefaults("hybrid_daybook_hq_procure")).toThrow(/Unknown operating method/);
      expect(() => parseCapabilities({ procurementChain: "sometimes" })).toThrow(/Invalid capabilities payload/);
      expect(() => parseCapabilities({ ...METHOD_CAPABILITY_DEFAULTS.delegated, extra: true })).not.toThrow();
    });
  });

  describe("3b. Policy Vocabulary Ratchet (shrink-only, ADR-0003/0004)", () => {
    // The legacy four-value workflow vocabulary must never grow back:
    // no code may read the dropped Organization column, seed rules from
    // it, or hard-code its values. "single_project_jv" is deliberately
    // NOT scanned — it is also the legitimate orgScale value.
    const FORBIDDEN = [
      /operatingModel/,
      /seedDelegationRules/,
      /hq_centralized_imprest/,
      /hybrid_daybook_hq_procure/,
      /decentralized_site_and_hq/,
    ] as const;

    function walk(dir: string, acc: string[] = []): string[] {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(p, acc);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          acc.push(p);
        }
      }
      return acc;
    }

    it("src/ and prisma/seed.ts carry no legacy operating-model vocabulary", () => {
      const repoRoot = path.resolve(__dirname, "../../..");
      const self = path.resolve(__filename);
      const files = [...walk(path.join(repoRoot, "src")), path.join(repoRoot, "prisma", "seed.ts")]
        // The enforcement file necessarily spells out the forbidden
        // patterns — it is its own allowlist entry.
        .filter((f) => f !== self);
      expect(files.length).toBeGreaterThan(100); // sanity: the sweep really ran

      const offenders: string[] = [];
      for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        for (const pattern of FORBIDDEN) {
          if (pattern.test(text)) offenders.push(`${path.relative(repoRoot, file)} matches ${pattern}`);
        }
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
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
      expect(trpc.createDomainRouter).toBeDefined();
      expect(trpc.financialGuard).toBeDefined();
      expect(trpc.capabilityGuard).toBeDefined();
    });

    it("capabilityGuard composes into a procedure chain (ADR-0006 §6 middleware-at-the-factory)", async () => {
      const { capabilityGuard, protectedProcedure } = await import("@/server/trpc");
      const chained = protectedProcedure.use(capabilityGuard({ procurementChain: "full" }));
      expect(typeof chained.input).toBe("function");
    });

    it("projectProcedure factory returns a callable tRPC procedure with role middleware", async () => {
      const { projectProcedure } = await import("@/server/trpc");
      const proc = projectProcedure("write");
      expect(proc).toBeDefined();
      expect(typeof proc.input).toBe("function");
    });

    it("createDomainRouter pre-binds the policy vocabulary (router + 5 procedure flavors)", async () => {
      const { createDomainRouter } = await import("@/server/trpc");
      const { router, proc } = createDomainRouter();
      expect(router).toBeDefined();
      for (const flavor of ["protected", "member", "write", "admin", "manager"] as const) {
        const p = proc[flavor];
        expect(p, `proc.${flavor}`).toBeDefined();
        expect(typeof p.input, `proc.${flavor}.input`).toBe("function");
      }
    });

    it("financialGuard composes into a procedure chain with explicit (non-guessing) money fields", async () => {
      const { financialGuard, protectedProcedure } = await import("@/server/trpc");
      const mw = financialGuard({
        action: "record_jv_payout",
        dateField: "payoutDate",
        amountFields: ["grossAmount"],
        bankAccountFields: ["bankAccountId"],
      });
      // The guard's contract is composability: it must slot into a
      // procedure chain via .use(). Full caller-level pipeline behavior is
      // covered in financial-guard.test.ts.
      const chained = protectedProcedure.use(mw);
      expect(typeof chained.input).toBe("function");
    });
  });
});
