/**
 * Core tRPC setup for Construction Manager.
 *
 * Defines:
 * - `router`            — create a new router
 * - `publicProcedure`   — no auth required
 * - `protectedProcedure` — requires authenticated user (JWT verified)
 *
 * The protectedProcedure middleware also sets the PostgreSQL RLS
 * (Row-Level Security) context so that the database itself enforces
 * organization-level data isolation — not just the application layer.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { setOrgContext } from "@/lib/rls";
import {
  isOrgAdmin,
  assertProjectMember,
  assertCanWrite,
  assertProjectAdmin,
  assertProjectManager,
  assertOrgBankAccount,
  type ProjectRole,
} from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { assertDelegation, type DelegationAction } from "@/lib/delegation";

// ─── Context ───────────────────────────────────────────────────
// The context is created per-request. We lazily resolve the user
// so public procedures don't pay the cost of auth verification.

export type TRPCContext = {
  user: AuthUser | null;
};

export async function createTRPCContext(opts: Request | { req: Request }): Promise<TRPCContext> {
  const req = opts instanceof Request ? opts : opts.req;
  const authHeader = req.headers.get("authorization");
  const user = await getCurrentUser(authHeader);
  return { user };
}

// ─── tRPC init ─────────────────────────────────────────────────

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    let message = shape.message;

    // Sanitize raw Prisma and database errors into human-readable messages.
    // ── IMPORTANT: check more-specific patterns BEFORE the generic Prisma
    //    wrapper ("Invalid `prisma.`") because Prisma wraps DB errors inside
    //    its own invocation message — the specific text can still be found
    //    via substring search on the full message string.
    if (message.includes("violates row-level security") || message.includes("row-level security policy")) {
      // Typically means withOrgContext was not called or the org context
      // does not match the record's organizationId.
      console.error("[trpc] RLS violation:", error);
      message = "Access denied — this record belongs to a different organisation. Refresh and try again, or contact your administrator.";
    } else if (
      message.includes("Unique constraint failed") ||
      message.includes("violates unique constraint") ||
      message.includes("P2002")
    ) {
      message = "A record with these details (or number) already exists. Please verify the input and try again.";
    } else if (
      message.includes("Foreign key constraint") ||
      message.includes("violates foreign key") ||
      message.includes("P2003")
    ) {
      message = "Cannot complete this action because a linked organization or project record was not found or is no longer valid.";
    } else if (message.includes("Record to update not found") || message.includes("Record to delete does not exist") || message.includes("P2025")) {
      message = "The record was not found — it may have already been deleted. Refresh the page and try again.";
    } else if (message.includes("relation") && message.includes("does not exist")) {
      console.error("[trpc] Missing table error:", error);
      message = "A required database table is missing. Please contact support or refresh the page.";
    } else if (message.includes("Invalid `prisma.") || message.includes("invocation:")) {
      console.error("[trpc] Prisma invocation error:", error);
      const rawText = (error?.cause as any)?.message || error?.message || message;
      const lines = String(rawText)
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean);
      const cleanLines = lines.filter(
        (l: string) =>
          !l.startsWith("Invalid `prisma.") &&
          !l.startsWith("-->") &&
          !l.includes("invocation:") &&
          !l.startsWith("at ") &&
          !l.includes("node_modules") &&
          !/^\s*(\{|\}|\(|\))\s*$/.test(l) &&
          !l.startsWith("+") &&
          !l.startsWith("-") &&
          !l.startsWith("data:")
      );
      const cleanReason = cleanLines[cleanLines.length - 1] || cleanLines[0];
      message = cleanReason
        ? `Database error: ${cleanReason}`
        : "Something went wrong while saving your data. Please try again or contact support if the problem persists.";
    } else if (process.env.NODE_ENV === "production") {
      const isTrpcError = error && typeof error === "object" && "name" in error && error.name === "TRPCError";
      if (!isTrpcError) {
        console.error("[trpc] Unhandled error (scrubbed from client):", error);
        message = "An unexpected error occurred. Please try again.";
      }
    }

    return {
      ...shape,
      message,
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
export const mergeRouters = t.mergeRouters;

// ─── Base Auth + RLS middleware ───────────────────────────────
const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }

  // Set RLS context — defense-in-depth at the database level.
  await setOrgContext(db, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(enforceAuth);

// ═══════════════════════════════════════════════════════════════
// CENTRAL SECURITY CONTROL PLANE: Declarative Security Procedures
// ═══════════════════════════════════════════════════════════════

/**
 * Organization Administrator Procedure:
 * Automatically enforces caller is an org_admin / owner of their assigned org.
 */
const enforceOrgAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  if (!isOrgAdmin(ctx.user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization admin access required." });
  }
  if (!ctx.user.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "User has no organization assigned." });
  }

  await setOrgContext(db, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      organizationId: ctx.user.organizationId,
    },
  });
});

export const orgAdminProcedure = t.procedure.use(enforceOrgAdmin);

/**
 * Platform Superadmin Procedure:
 * Enforces platform-tier admin access with a dedicated admin-kind session.
 */
const enforceSuperAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  if (!ctx.user.isPlatformAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin access required." });
  }
  if (ctx.user.sessionKind !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Use the platform admin login to access this area.",
    });
  }

  await setOrgContext(db, "", true);

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const superAdminProcedure = t.procedure.use(enforceSuperAdmin);

/**
 * Project-Scoped Declarative Procedure:
 * Automatically intercepts `projectId` from input, verifies user membership
 * and role criteria, and injects `ctx.projectId` & `ctx.projectRole`.
 */
export const projectProcedure = (
  requiredRole: "member" | "write" | "admin" | "manager" = "member"
) =>
  protectedProcedure.use(async ({ ctx, getRawInput, next }) => {
    const rawInput = await getRawInput();
    const inputObj = rawInput && typeof rawInput === "object" ? (rawInput as Record<string, any>) : {};
    const projectId = inputObj.projectId;

    if (!projectId || typeof projectId !== "string") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Missing or invalid projectId in request payload.",
      });
    }

    let role: ProjectRole;
    if (requiredRole === "manager") {
      role = await assertProjectManager(ctx.user, projectId);
    } else if (requiredRole === "admin") {
      role = await assertProjectAdmin(ctx.user, projectId);
    } else if (requiredRole === "write") {
      role = await assertCanWrite(ctx.user, projectId);
    } else {
      role = await assertProjectMember(ctx.user, projectId);
    }

    return next({
      ctx: {
        ...ctx,
        projectId,
        projectRole: role,
      },
    });
  });

/**
 * Domain Router Factory + Financial Guard:
 * Adopted Phase E — extracted from leave / site-expense / jv-partner pilots.
 *
 * Before the factory, routers hand-rolled the same security pipeline in ~528
 * inline calls (assertProjectMember/assertCanWrite/... + assertNotLocked +
 * assertDelegation), while the declarative projectProcedure had 8 adopters.
 * createDomainRouter pre-binds the policy vocabulary so a router declares
 * role policy once:
 *
 *   const { router, proc } = createDomainRouter();
 *   export const xRouter = router({
 *     list:  proc.member.input(...).query(...),
 *     create: proc.write.use(financialGuard({ action: "create_x", amountFields: ["amount"] }))
 *              .input(...).mutation(...),
 *   });
 *
 * proc.* are input-level guards: they require `projectId` in the input and
 * inject ctx.projectId / ctx.projectRole. Record-level authorization (the
 * record's project differs from input, e.g. approve-by-id) stays in the
 * handler — it is a different concern.
 */
export function createDomainRouter() {
  return {
    router,
    proc: {
      /** Authenticated, no project scope. */
      protected: protectedProcedure,
      /** Requires projectId in input; injects ctx.projectId + ctx.projectRole. */
      member: projectProcedure("member"),
      write: projectProcedure("write"),
      admin: projectProcedure("admin"),
      manager: projectProcedure("manager"),
    },
  };
}

/**
 * Strict financial middleware — the declarative successor of financialProcedure.
 *
 * Unlike financialProcedure, it NEVER guesses input shapes: the author must
 * name the date field, the amount fields, and the bank-account fields
 * explicitly. Composition order matters — chain it AFTER a proc.* guard so
 * auth, RLS context and project membership are already established:
 *
 *   proc.write.use(financialGuard({
 *     action: "create_site_expense",
 *     dateField: "date",                  // optional; absent -> today
 *     amountFields: ["amount", "vatAmount"], // summed for delegation limit
 *   }))
 *
 * Pipeline: fiscal-year lock (org + date) -> delegation limit (sum of
 * finite numeric amount fields, when > 0) -> org bank-account isolation.
 */
export function financialGuard(opts: {
  action: DelegationAction;
  /** Input field carrying the transaction date. Absent field or value -> today (same as legacy trio). */
  dateField?: string;
  /** Input fields summed (finite numbers only) for the delegation limit check. Required so authors state the money shape explicitly; pass [] only for non-monetary actions. */
  amountFields: string[];
  /** Input fields holding org bank-account ids to verify for the caller's organization. */
  bankAccountFields?: string[];
}) {
  return t.middleware(async ({ ctx, getRawInput, next }) => {
    const rawInput = await getRawInput();
    const input = rawInput && typeof rawInput === "object" ? (rawInput as Record<string, unknown>) : {};

    // Fail loud — the guard always runs behind a proc.* guard (auth done),
    // but a statically-impossible state must never pass silently. Re-inject
    // the narrowed user so downstream handlers keep ctx.user: AuthUser.
    const user = ctx.user;
    if (!user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
    }

    // 1. Fiscal-year lock on the effective transaction date.
    const rawDate = opts.dateField ? input[opts.dateField] : undefined;
    const fiscalDate = rawDate ? new Date(rawDate as string | number | Date) : new Date();
    await assertNotLocked(user.organizationId, fiscalDate);

    // 2. Delegation limit over the explicitly named money fields.
    let amount = 0;
    for (const field of opts.amountFields) {
      const v = input[field];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) amount += v;
    }
    if (amount > 0) {
      await assertDelegation(user, opts.action, amount);
    }

    // 3. Multi-tenant bank account isolation.
    for (const field of opts.bankAccountFields ?? []) {
      const v = input[field];
      if (typeof v === "string" && v.length > 0) {
        await assertOrgBankAccount(v, user.organizationId);
      }
    }

    return next({
      ctx: {
        ...ctx,
        user,
        fiscalDate,
        delegatedAction: opts.action,
      },
    });
  });
}
