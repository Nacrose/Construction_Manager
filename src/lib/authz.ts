// Server-side authorization helpers — the replacement for the old
// client-side _assertXxxWriteAccess guards. Every API route that mutates
// data must call one of these.

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

// Returns the user's role on a project, or null if not a member.
export async function getProjectRole(
  userId: string,
  projectId: string,
  opts?: { impersonating?: boolean; organizationId?: string | null },
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

  // While a platform admin is impersonating a tenant org, grant access to
  // every project in that org — but ONLY that org. This is the single choke
  // point that lets an impersonating admin read/act on a tenant's projects
  // without ever crossing into another org's data (RLS may be unreliable
  // under connection pooling, so we scope explicitly and centrally here).
  // The synthetic "engineer" role permits writes but not project-admin
  // (pm/coordinator-only) actions.
  if (opts?.impersonating && opts.organizationId) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (project && project.organizationId === opts.organizationId) {
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
  });
  if (!role) {
    throw new Error("FORBIDDEN");
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
    throw new Error("READ_ONLY");
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
    throw new Error("REQUIRES_ADMIN");
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
    throw new Error("REQUIRES_PROJECT_MANAGER");
  }
  return role;
}

// Maps a thrown auth error to an HTTP status + message.
export function authErrorToResponse(err: unknown): {
  status: number;
  message: string;
} {
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
    default:
      return { status: 500, message: "Internal error." };
  }
}
