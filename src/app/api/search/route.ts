import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { setOrgContext } from "@/lib/rls";
import { ok, handleError, unauthorized } from "@/lib/api";

// GET /api/search?q=<query>
// Searches across the user's projects, RFIs, and daily reports.
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req.headers.get("authorization"));
    if (!user) return unauthorized();

    // RLS context — REST routes bypass the tRPC context builder, so the
    // org context must be set here too (RLS rollout Phase 0, gap G-2).
    await setOrgContext(db, user.organizationId, !!user.isSuperAdmin);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.toLowerCase()?.trim();
    if (!q || q.length < 2) return ok({ projects: [], rfis: [], reports: [] });

    const memberships = await db.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    const projectIds = memberships.map((m) => m.projectId);

    const [projects, rfis, reports] = await Promise.all([
      db.project.findMany({
        where: {
          id: { in: projectIds },
          OR: [
            { name: { contains: q } },
            { code: { contains: q } },
            { client: { contains: q } },
            { location: { contains: q } },
          ],
        },
        take: 5,
        select: { id: true, name: true, code: true, status: true },
      }),
      db.rfi.findMany({
        where: {
          projectId: { in: projectIds },
          OR: [{ number: { contains: q } }, { subject: { contains: q } }],
        },
        take: 5,
        include: { project: { select: { id: true, name: true, code: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.dailyReport.findMany({
        where: {
          projectId: { in: projectIds },
          OR: [{ number: { contains: q } }, { problems: { contains: q } }],
        },
        take: 5,
        include: { project: { select: { id: true, name: true, code: true } } },
        orderBy: { reportDate: "desc" },
      }),
    ]);

    return ok({
      projects: projects.map((p) => ({ ...p, href: `/projects/${p.id}` })),
      rfis: rfis.map((r) => ({
        id: r.id, number: r.number, subject: r.subject, status: r.status,
        project: r.project,
        href: `/projects/${r.projectId}/workflow/rfi/${r.id}`,
      })),
      reports: reports.map((r) => ({
        id: r.id, number: r.number, status: r.status,
        reportDate: r.reportDate,
        project: r.project,
        href: `/projects/${r.projectId}/workflow/reports/${r.id}`,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
