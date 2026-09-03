/**
 * Router-layer test harness.
 *
 * Lets us call tRPC procedures directly (`router.createCaller({ user })`)
 * against a fully mocked Prisma client — no database needed. The db mock is
 * a Proxy: any model access yields an object of vi.fn()s with sensible
 * default resolutions; tests override exactly what the scenario needs and
 * can assert on call arguments.
 *
 * Usage in a test file:
 *
 *   import { describe, it, expect, vi } from "vitest";
 *
 *   vi.mock("@/lib/db", async () => {
 *     const { buildDbMock } = await import("./test-utils");
 *     const db = buildDbMock();
 *     return { db, getFreshDb: () => db };
 *   });
 *   // import { db } from "@/lib/db"; AFTER the mock — then:
 *   // (db as any).projectMember.findUnique.mockResolvedValue({...})
 */
import { vi, expect } from "vitest";
import type { AuthUser } from "@/lib/auth";
import { METHOD_CAPABILITY_DEFAULTS, type OperatingCapabilities } from "@/lib/capabilities";

/**
 * Org row satisfying capabilityGuard's resolveOrgPolicy. Defaults to the
 * delegated method (all capabilities on) so un-gated behavior is preserved;
 * pass a method or partial capability overrides to exercise the gate.
 *
 * - Without `capabilities`: resolves through method defaults (no active
 *   version row) — the pre-bootstrap shape.
 * - With `capabilities`: an ACTIVE OrganizationPolicyVersion snapshot is
 *   returned with the overrides merged over the delegated defaults.
 */
export function orgPolicyFixture(opts?: {
  operatingMethod?: "owner_led" | "crew_led" | "delegated";
  capabilities?: Partial<OperatingCapabilities>;
}) {
  const method = opts?.operatingMethod ?? "delegated";
  if (opts?.capabilities) {
    return {
      operatingMethod: method,
      activePolicyVersionId: "pv-1",
      activePolicyVersion: {
        version: 1,
        operatingMethod: method,
        capabilities: { ...METHOD_CAPABILITY_DEFAULTS.delegated, ...opts.capabilities },
      },
    };
  }
  return {
    operatingMethod: method,
    activePolicyVersionId: null,
    activePolicyVersion: null,
    // assertDelegation fields — centralized finance, default petty-cash cap.
    financeLocation: "centralized",
    sitePettyCashLimit: 50000,
  };
}

type AnyFn = (...args: any[]) => any;

const MODEL_OPS: Record<string, any> = {
  findUnique: null,
  findFirst: null,
  findMany: [],
  findFirstOrThrow: null,
  findUniqueOrThrow: null,
  create: {},
  createMany: { count: 1 },
  update: {},
  updateMany: { count: 1 },
  delete: {},
  deleteMany: { count: 1 },
  upsert: {},
  count: 0,
  // Prisma aggregates group under _sum/_count/_max/_min — provide the
  // common groupings so unmocked aggregates (e.g. `_sum.quantity || 0`)
  // don't crash; tests override with real values when asserting math.
  aggregate: { _sum: {}, _count: {}, _max: {}, _min: {} },
  groupBy: [],
};

export type DbMock = Record<string, any> & { $transaction: AnyFn };

/** Build the Proxy-based Prisma mock (see file doc). */
export function buildDbMock(): DbMock {
  const target: Record<string, any> = {
    $transaction: vi.fn(async (fnOrArray: any) =>
      typeof fnOrArray === "function" ? fnOrArray(proxy) : fnOrArray,
    ),
    $queryRaw: vi.fn(async () => []),
    $queryRawUnsafe: vi.fn(async () => []),
    // Default 1 (one row affected): the guarded settlement/bank UPDATEs
    // check the rowcount — a defaulted 0 would read as "guard rejected /
    // row vanished" and fail every happy path. Overpayment-guard tests
    // mock 0 explicitly.
    $executeRaw: vi.fn(async () => 1),
    $executeRawUnsafe: vi.fn(async () => 0),
    $disconnect: vi.fn(async () => undefined),
    __isMock: true,
  };

  const proxy: DbMock = new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      const model: Record<string, AnyFn> = {};
      for (const [op, defaultRes] of Object.entries(MODEL_OPS)) {
        model[op] = vi.fn(async () =>
          typeof defaultRes === "function" ? defaultRes() : defaultRes,
        );
      }
      t[prop] = model;
      return model;
    },
  }) as DbMock;

  return proxy;
}

/** Test user factory. Defaults: org-1 member. */
export function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    email: "test@org1.com",
    name: "Test User",
    organizationId: "org-1",
    orgRole: "member",
    isSuperAdmin: false,
    isPlatformAdmin: false,
    ...overrides,
  } as AuthUser;
}

/**
 * Create a server-side caller for a router. Bypasses HTTP + the context
 * builder — `user` is injected directly (protectedProcedure only requires
 * ctx.user; RLS setOrgContext is a no-op against the mocked db).
 */
export function createCaller(routerObj: any, user: AuthUser | null) {
  return routerObj.createCaller({ user });
}

/** Assert a procedure call rejects with the given tRPC error code. */
export async function expectTRPCError(
  promise: Promise<unknown>,
  code: string,
): Promise<any> {
  try {
    await promise;
  } catch (err: any) {
    expect(err?.code ?? err?.shape?.code).toBe(code);
    return err;
  }
  throw new Error(`Expected procedure to throw ${code}, but it resolved`);
}
