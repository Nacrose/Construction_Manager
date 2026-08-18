import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, handleError, unauthorized } from "@/lib/api";

// GET /api/dashboard — KPIs, charts, and recent activity for the current user.
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req.headers.get("authorization"));
    if (!user) return unauthorized();

    const memberships = await db.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true, role: true },
    });
    const projectIds = memberships.map((m) => m.projectId);

    if (projectIds.length === 0) {
      return ok({
        stats: { projects: 0, openRfis: 0, draftRfis: 0, approvedRfis: 0, totalContractValue: 0 },
        recentRfis: [],
        projectsByStatus: { active: 0, on_hold: 0, completed: 0, archived: 0 },
        costBreakdown: [],
        rfiByStatus: [],
        cashFlow: [],
        projectProgress: [],
      });
    }

    const [openRfis, draftRfis, approvedRfis, recentRfis, projects, allRfis, allIpcs, allBoqItems] =
      await Promise.all([
        db.rfi.count({ where: { projectId: { in: projectIds }, status: { in: ["submitted", "draft"] } } }),
        db.rfi.count({ where: { projectId: { in: projectIds }, status: "draft" } }),
        db.rfi.count({ where: { projectId: { in: projectIds }, status: "approved" } }),
        db.rfi.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { project: { select: { id: true, name: true, code: true } } },
        }),
        db.project.findMany({
          where: { id: { in: projectIds }, status: { not: "archived" } },
          select: { id: true, name: true, code: true, status: true, contractValue: true, startDate: true, endDate: true },
        }),
        db.rfi.findMany({
          where: { projectId: { in: projectIds } },
          select: { status: true, createdAt: true, respondedAt: true },
        }),
        db.ipc.findMany({
          where: { projectId: { in: projectIds } },
          select: { projectId: true, grossAmount: true, netPayable: true, status: true, period: true, createdAt: true, items: { select: { cumQty: true, contractQty: true, rate: true } } },
        }),
        db.boqItem.findMany({
          where: { projectId: { in: projectIds } },
          select: { section: true, category: true, amount: true, quantity: true, rate: true },
        }),
      ]);

    const projectsByStatus = {
      active: projects.filter((p) => p.status === "active").length,
      on_hold: projects.filter((p) => p.status === "on_hold").length,
      completed: projects.filter((p) => p.status === "completed").length,
      archived: projects.filter((p) => p.status === "archived").length,
    };

    // Cost breakdown by section
    const sectionMap = new Map<string, number>();
    allBoqItems.forEach((b) => {
      const sec = b.section ?? b.category ?? "Uncategorized";
      sectionMap.set(sec, (sectionMap.get(sec) ?? 0) + b.amount);
    });
    const costBreakdown = Array.from(sectionMap.entries())
      .map(([section, amount]) => ({ section, amount }))
      .sort((a, b) => b.amount - a.amount);

    // RFI by status (for donut chart)
    const rfiStatusMap = new Map<string, number>();
    allRfis.forEach((r) => rfiStatusMap.set(r.status, (rfiStatusMap.get(r.status) ?? 0) + 1));
    const rfiByStatus = Array.from(rfiStatusMap.entries()).map(([status, count]) => ({ status, count }));

    // Cash flow by month (from IPCs)
    const monthMap = new Map<string, { billed: number; paid: number }>();
    allIpcs.forEach((ipc) => {
      const month = ipc.period ?? new Date(ipc.createdAt).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const entry = monthMap.get(month) ?? { billed: 0, paid: 0 };
      entry.billed += ipc.grossAmount;
      if (ipc.status === "paid") entry.paid += ipc.netPayable;
      monthMap.set(month, entry);
    });
    const cashFlow = Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v })).slice(-6);

    // Project progress (physical %, financial %)
    const projectProgress = projects.map((p) => {
      // Scope IPCs to this project only — previously the loop used the
      // cross-project `allIpcs` array, so every project showed the same
      // aggregate physical/financial progress (the union of all IPCs).
      const projectIpcs = allIpcs.filter((ipc) => ipc.projectId === p.id);
      // Physical progress: from IPC items, sum(cumQty * rate) / sum(contractQty * rate)
      let cumValue = 0;
      let contractValue = 0;
      projectIpcs.forEach((ipc) => {
        ipc.items.forEach((i) => {
          if (i.contractQty > 0) {
            cumValue += i.cumQty * i.rate;
            contractValue += i.contractQty * i.rate;
          }
        });
      });
      const physical = contractValue > 0 ? (cumValue / contractValue) * 100 : 0;

      // Financial progress: from IPC net payable / project contract value
      const totalPaid = projectIpcs
        .filter((ipc) => ipc.status === "paid" || ipc.status === "approved")
        .reduce((s, ipc) => s + ipc.netPayable, 0);
      const financial = p.contractValue && p.contractValue > 0
        ? (totalPaid / p.contractValue) * 100
        : 0;

      return {
        id: p.id,
        name: p.name,
        code: p.code,
        physical: Math.min(physical, 100),
        financial: Math.min(financial, 100),
        contractValue: p.contractValue ?? 0,
      };
    });

    const totalContractValue = projects.reduce((s, p) => s + (p.contractValue ?? 0), 0);

    return ok({
      stats: {
        projects: projectIds.length,
        openRfis,
        draftRfis,
        approvedRfis,
        totalContractValue,
      },
      recentRfis: recentRfis.map((r) => ({
        id: r.id, number: r.number, subject: r.subject, status: r.status,
        priority: r.priority, createdAt: r.createdAt, project: r.project,
      })),
      projectsByStatus,
      costBreakdown,
      rfiByStatus,
      cashFlow,
      projectProgress,
    });
  } catch (err) {
    return handleError(err);
  }
}
