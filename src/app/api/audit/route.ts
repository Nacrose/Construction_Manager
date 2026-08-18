import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertProjectMember } from "@/lib/authz";
import { ok, handleError, unauthorized } from "@/lib/api";

// GET /api/audit — audit logs for the current user's projects
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req.headers.get("authorization"));
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const memberships = await db.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    const projectIds = memberships.map((m) => m.projectId);

    // If a specific projectId is requested, verify the user is a member
    // of that project before returning its audit logs.
    if (projectId) {
      await assertProjectMember(user, projectId);
    }

    const logs = await db.auditLog.findMany({
      where: {
        ...(projectId ? { projectId } : { projectId: { in: projectIds } }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });

    return ok({ logs });
  } catch (err) {
    return handleError(err);
  }
}
