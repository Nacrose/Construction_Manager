// Audit log — every mutating API route records what happened, by whom,
// on which project. Replaces the old silent cascade-deletes.

import { db } from "@/lib/db";
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
        await db.auditLog.create({
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
      } catch {
        // Logging failures must never impact core application operations.
      }
    });
  } catch {
    // Fallback if execution occurs outside a valid request/response context
  }
}

