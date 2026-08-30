// Audit log — every mutating API route records what happened, by whom,
// on which project. Replaces the old silent cascade-deletes.

import { db } from "@/lib/db";
import { withOrgContext } from "@/lib/rls";
import { after } from "next/server";

export function audit({
  userId,
  projectId,
  action,
  entityType,
  entityId,
  metadata,
  ipAddress,
  impersonatedOrgId,
  impersonatedByUserId,
}: {
  userId?: string;
  projectId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  impersonatedOrgId?: string | null;
  impersonatedByUserId?: string | null;
}): void {
  try {
    // Schedule the database log insertion to run in the background
    // after the Next.js response has been fully sent to the client.
    after(async () => {
      try {
        // RLS (phase 3c): AuditLog is FORCE-scoped. The after() callback
        // runs on an arbitrary pooled connection where the request's
        // session-level org GUC may be absent — a bare INSERT could land
        // on a context-less connection and be denied. Run it inside an
        // interactive transaction (the reliable primitive) with the org
        // context derived from the acting user, falling back to the
        // project's org, falling back to superadmin (system-level rows
        // with neither user nor project stay superadmin-visible only).
        await db.$transaction(async (tx) => {
          await withOrgContext(tx, null, true); // bootstrap: lookups
          let orgId: string | null = null;
          let isSuperAdmin = false;
          if (userId) {
            const user = await tx.user.findUnique({
              where: { id: userId },
              select: { organizationId: true, isSuperAdmin: true },
            });
            orgId = user?.organizationId ?? null;
            isSuperAdmin = !!user?.isSuperAdmin;
          }
          if (!orgId && projectId) {
            const project = await tx.project.findUnique({
              where: { id: projectId },
              select: { organizationId: true },
            });
            orgId = project?.organizationId ?? null;
          }
          await withOrgContext(tx, orgId, isSuperAdmin || !orgId);
          await tx.auditLog.create({
            data: {
              userId: userId ?? null,
              projectId: projectId ?? null,
              action,
              entityType,
              entityId,
              metadata: metadata ? JSON.stringify(metadata) : null,
              ipAddress: ipAddress ?? null,
              impersonatedOrgId: impersonatedOrgId ?? null,
              impersonatedByUserId: impersonatedByUserId ?? null,
            },
          });
        });
      } catch {
        // Logging failures must never impact core application operations.
      }
    });
  } catch {
    // Fallback if execution occurs outside a valid request/response context
  }
}

