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

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    let message = shape.message;

    // Sanitize raw Prisma and database errors into human-readable messages.
    // In production, we never want to expose Prisma internals (table names,
    // column names, query fragments) to the client — they can be used for
    // enumeration attacks. The specific codes below are safe to map to
    // human messages; everything else falls through to a generic message
    // in production if it looks like a DB internal.
    if (message.includes("Unique constraint failed") || message.includes("P2002")) {
      message = "An item with this name and specification already exists in this catalog.";
    } else if (message.includes("Foreign key constraint failed") || message.includes("P2003")) {
      message = "This operation could not be completed because related data depends on it.";
    } else if (message.includes("Record to update not found") || message.includes("Record to delete does not exist") || message.includes("P2025")) {
      message = "The requested record was not found or has already been deleted.";
    } else if (message.includes("Invalid `prisma.") || message.includes("invocation:")) {
      message = "A database error occurred while processing your request. Please try again.";
    } else if (process.env.NODE_ENV === "production") {
      // In production, if this is NOT a TRPCError (i.e. it's an unexpected
      // Prisma/runtime error), scrub the message to prevent leaking DB
      // internals. TRPCErrors are thrown by our own code with safe messages.
      const isTrpcError = error && typeof error === "object" && "name" in error && error.name === "TRPCError";
      if (!isTrpcError) {
        console.error("[trpc] Unhandled error (scrubbed from client):", error);
        message = "An internal error occurred. Please try again.";
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
  // `ctx.user.isSuperAdmin` is already the EFFECTIVE flag: it is false while
  // a superadmin is impersonating a tenant org (so RLS scopes to that org),
  // and true otherwise. App-level filtering in the routers keys off the same
  // effective identity, so tenant scoping is reliable even when RLS is not
  // enforced (e.g. under connection pooling).
  await setOrgContext(db, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
