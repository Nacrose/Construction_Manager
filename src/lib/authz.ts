// Server-side authorization helpers — the replacement for the old
// client-side _assertXxxWriteAccess guards. Every API route that mutates
// data must call one of these.

import { TRPCError } from "@trpc/server";
import { db } from "@/lib/db";
import type { AuthUser } from "@/lib/auth";

export type ProjectRole =
  | "project_manager"
  | "engineer"
  | "coordinator"
  | "client"
  | "inspector";

// Returns true if the user is an organization administrator (top role
// within their org). This replaces the old platform "super admin" concept:
// there is no cross-organization god user — only org-scoped admins.
export function isOrgAdmin(user: AuthUser | null | undefined): boolean {
  return !!user && (user.orgRole === "org_admin" || user.orgRole === "owner");
}

// Throws unless the user is an organization administrator of their own org.
// Cross-tenant actions by super admins are handled separately via the
// `adminRouter` (which requires a platform-admin session).
//
// IMPORTANT: org-admin authority NEVER crosses organization boundaries.
// Any procedure that mutates a target user/resource MUST additionally
// verify the target belongs to the same organization as the caller.
export function assertOrgAdmin(user: AuthUser | null | undefined): void {
  if (!isOrgAdmin(user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization admin access required." });
  }
}

/**
 * Multi-Tenant Bank Account Security Choke Point:
 * Throws unless the bank account exists and strictly belongs to the caller's organization.
 * Accepts either the standard db client or an ongoing Prisma transaction client (`tx`).
 */
export async function assertOrgBankAccount(
  bankAccountId: string,
  organizationId: string | null | undefined,
  txDb: any = db
): Promise<{ id: string; organizationId: string; currentBalance: number; name?: string; accountNumber?: string }> {
  if (!organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "User has no organization assigned." });
  }
  const bank = await txDb.companyBankAccount.findUnique({
    where: { id: bankAccountId },
    select: { id: true, organizationId: true, currentBalance: true, name: true, accountNumber: true },
  });
  if (!bank || bank.organizationId !== organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Bank account not found in your organization." });
  }
  return bank;
}

// Returns the user's role on a project, or null if not a member.
export async function getProjectRole(
  userId: string,
  projectId: string,
  opts?: { impersonating?: boolean; organizationId?: string | null; orgRole?: string | null },
): Promise<ProjectRole | null> {
  // Super admins don't get automatic project access.
  // They must be explicitly added as project members.
  const membership = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  if (membership?.role) {
    return membership.role as ProjectRole;
  }

  // Grant access if the caller's organization owns this project (or if platform admin is impersonating).
  if (opts?.organizationId) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (project && project.organizationId === opts.organizationId) {
      if (opts.orgRole === "org_admin" || opts.orgRole === "org_owner" || opts.impersonating) {
        return "project_manager";
      }
      return "engineer";
    }
  }

  return null;
}

// Throws if the user has no access to the project at all.
export async function assertProjectMember(
  user: AuthUser,
  projectId: string
): Promise<ProjectRole> {
  const role = await getProjectRole(user.id, projectId, {
    impersonating: user.impersonating,
    organizationId: user.organizationId,
    orgRole: user.orgRole,
  });
  if (!role) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project." });
  }
  return role;
}

// Throws unless the user can write to the project.
// Read-only roles: client, inspector. (Inspectors also get read on BOQ/Gantt
// in the old app — we keep that policy here.)
export async function assertCanWrite(
  user: AuthUser,
  projectId: string
): Promise<ProjectRole> {
  const role = await assertProjectMember(user, projectId);
  if (role === "client" || role === "inspector") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your role on this project is read-only." });
  }
  return role;
}

// Throws unless the user is a project_manager or coordinator (admin-tier).
export async function assertProjectAdmin(
  user: AuthUser,
  projectId: string
): Promise<ProjectRole> {
  const role = await assertProjectMember(user, projectId);
  if (role !== "project_manager" && role !== "coordinator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Project admin access required (Project Manager or Coordinator)." });
  }
  return role;
}

// Throws unless the user is a project_manager (full delete rights).
export async function assertProjectManager(
  user: AuthUser,
  projectId: string
): Promise<ProjectRole> {
  const role = await assertProjectMember(user, projectId);
  if (role !== "project_manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Project Manager access required." });
  }
  return role;
}

// Maps a thrown auth error to an HTTP status + message.
//
// Handles BOTH the new TRPCError-based throws (used inside tRPC routers)
// and the legacy raw-Error code strings (for REST route handlers that
// catch and re-map). The raw-Error path is kept for backwards
// compatibility — new code should throw TRPCError directly.
export function authErrorToResponse(err: unknown): {
  status: number;
  message: string;
} {
  // TRPCError path — the modern way. tRPC errors carry a `code` property
  // (UNAUTHORIZED, FORBIDDEN, etc.) that maps directly to HTTP status.
  if (err && typeof err === "object" && "code" in err && typeof (err as any).code === "string") {
    const code = (err as any).code as string;
    const message = (err as any).message || "Authorization error.";
    switch (code) {
      case "UNAUTHORIZED":
        return { status: 401, message };
      case "FORBIDDEN":
        return { status: 403, message };
      case "NOT_FOUND":
        return { status: 404, message };
      default:
        return { status: 500, message };
    }
  }

  // Legacy raw-Error path — kept for backwards compat with any code
  // that still throws `new Error("FORBIDDEN")` etc.
  const code = err instanceof Error ? err.message : "UNKNOWN";
  switch (code) {
    case "UNAUTHENTICATED":
      return { status: 401, message: "Authentication required." };
    case "FORBIDDEN":
      return { status: 403, message: "You are not a member of this project." };
    case "READ_ONLY":
      return {
        status: 403,
        message: "Your role on this project is read-only.",
      };
    case "REQUIRES_ADMIN":
      return {
        status: 403,
        message: "This action requires Project Manager or Coordinator role.",
      };
    case "REQUIRES_PROJECT_MANAGER":
      return {
        status: 403,
        message: "This action requires Project Manager role.",
      };
    case "REQUIRES_ORG_ADMIN":
      return {
        status: 403,
        message: "This action requires Organization Admin role.",
      };
    default:
      return { status: 500, message: "Internal error." };
  }
}
