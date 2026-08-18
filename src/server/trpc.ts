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

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
export const mergeRouters = t.mergeRouters;

// ─── Auth + RLS middleware ────────────────────────────────────
// This middleware:
// 1. Verifies the user is authenticated (JWT + session check)
// 2. Sets the PostgreSQL RLS session variables so the database
//    itself enforces organization-level data isolation
//
// The RLS context is set via set_config('app.organization_id', ...)
// which the Project table's RLS policies check. Even if a bug in
// the application code skips the org filter, the database blocks
// the query from returning data from another organization.

const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }

  // Set RLS context — defense-in-depth at the database level.
  // If this fails (e.g., pgbouncer mode mismatch), the app-level
  // filtering in project.list is still active.
  await setOrgContext(db, ctx.user.organizationId, ctx.user.isSuperAdmin);

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
