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
    } else if (message.includes("Unique constraint failed") || message.includes("P2002")) {
      message = "A record with these details already exists. Please check for duplicates and try again.";
    } else if (message.includes("Foreign key constraint failed") || message.includes("P2003")) {
      message = "Cannot complete this action because linked records still depend on it.";
    } else if (message.includes("Record to update not found") || message.includes("Record to delete does not exist") || message.includes("P2025")) {
      message = "The record was not found — it may have already been deleted. Refresh the page and try again.";
    } else if (message.includes("relation") && message.includes("does not exist")) {
      console.error("[trpc] Missing table error:", error);
      message = "A required database table is missing. Please contact support or refresh the page.";
    } else if (message.includes("Invalid `prisma.") || message.includes("invocation:")) {
      console.error("[trpc] Prisma invocation error:", error);
      message = "Something went wrong while saving your data. Please try again or contact support if the problem persists.";
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
 * Financial Mutation Declarative Procedure:
 * Centralized 5-Point Financial & Multi-Tenant Pipeline:
 *  1. Project write permission check (if projectId present)
 *  2. Fiscal year lock check on target date
 *  3. Operating model delegation limits on monetary amount
 *  4. Multi-tenant bank account isolation check
 *  5. Injects verified financial metadata into context
 */
export const financialProcedure = (action: DelegationAction) =>
  protectedProcedure.use(async ({ ctx, getRawInput, next }) => {
    const rawInput = await getRawInput();
    const inputObj = rawInput && typeof rawInput === "object" ? (rawInput as Record<string, any>) : {};

    // 1. Project write access check if projectId is present
    const projectId = inputObj.projectId;
    if (projectId && typeof projectId === "string") {
      await assertCanWrite(ctx.user, projectId);
    }

    // 2. Fiscal year lock check
    const dateVal = inputObj.paymentDate || inputObj.payoutDate || inputObj.billDate || inputObj.date;
    const targetDate = dateVal ? new Date(dateVal) : new Date();
    await assertNotLocked(ctx.user.organizationId, targetDate);

    // 3. Financial delegation limit check
    const amount = Number(inputObj.grossAmount ?? inputObj.amount ?? inputObj.totalAmount ?? 0);
    if (amount > 0) {
      await assertDelegation(ctx.user, action, amount);
    }

    // 4. Multi-tenant bank account isolation check
    const bankIds = [
      inputObj.bankAccountId,
      inputObj.companyBankAccountId,
      inputObj.transportBankAccountId,
      inputObj.incidentalBankAccountId,
    ].filter((id): id is string => typeof id === "string" && id.length > 0);

    for (const bId of bankIds) {
      await assertOrgBankAccount(bId, ctx.user.organizationId);
    }

    return next({
      ctx: {
        ...ctx,
        fiscalDate: targetDate,
        delegatedAction: action,
        projectId: typeof projectId === "string" ? projectId : undefined,
      },
    });
  });
