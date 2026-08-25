import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertProjectMember } from "@/lib/authz";
import { generateMSPXML, type MSPTask } from "@/server/utils/msp-export";

/**
 * GET /api/gantt/export-msp?projectId=xxx&versionId=yyy
 *
 * Exports the Gantt schedule as an MS Project XML (.xml) file that
 * can be imported by MS Project, Primavera P6, OpenProject, etc.
 *
 * The file is returned as a downloadable attachment with
 * Content-Type: application/xml and Content-Disposition: attachment.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const user = await getCurrentUser(authHeader);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const versionId = searchParams.get("versionId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    await assertProjectMember(user, projectId);

    // Determine target version
    let targetVersionId = versionId || undefined;
    if (!targetVersionId) {
      const active = await db.ganttVersion.findFirst({
        where: { projectId, isActive: true },
        select: { id: true },
      });
      if (active) targetVersionId = active.id;
    }

    if (!targetVersionId) {
      return NextResponse.json({ error: "No version found to export" }, { status: 404 });
    }

    // Get version info — fetch with projectId filter so a caller can't
    // export a version that belongs to a different project than the one
    // they passed (and were authorized on) above.
    const version = await db.ganttVersion.findFirst({
      where: { id: targetVersionId, projectId },
      select: { name: true, versionNumber: true, project: { select: { name: true, code: true } } },
    });

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Get tasks with BOQ links and dependencies
    const tasks = await db.ganttTask.findMany({
      where: { versionId: targetVersionId },
      include: {
        boqLinks: { include: { boqItem: { select: { rate: true } } } },
        predecessors: { include: { predecessor: { select: { code: true } } } },
      },
      orderBy: { sortOrder: "asc" },
    });

    // Convert to MSPTask format
    const mspTasks: MSPTask[] = tasks.map((task) => {
      const plannedCost = task.boqLinks.reduce(
        (sum, link) => sum + link.quantity * (link.boqItem.rate || 0),
        0
      );

      // Parse dependencies from the JSON field (legacy) + normalized predecessors
      let deps: MSPTask["dependencies"] = [];
      if (task.predecessors.length > 0) {
        deps = task.predecessors.map((pred) => ({
          predecessorId: pred.predecessorId,
          predecessorCode: pred.predecessor.code,
          type: pred.type,
          offset: pred.offset,
        }));
      } else if (task.dependencies) {
        try {
          const parsed = JSON.parse(task.dependencies);
          deps = parsed.map((d: any) => ({
            predecessorId: typeof d === "string" ? d : d.taskId || null,
            predecessorCode: d.taskCode || null,
            type: d.type || "FS",
            offset: d.offset || 0,
          }));
        } catch {
          // ignore
        }
      }

      return {
        id: task.id,
        name: task.name,
        code: task.code,
        startDate: task.startDate,
        endDate: task.endDate,
        actualStartDate: task.actualStartDate,
        actualEndDate: task.actualEndDate,
        duration: task.duration,
        progress: task.progress,
        parentId: task.parentId,
        isMilestone: task.isMilestone,
        sortOrder: task.sortOrder,
        plannedCost,
        // MS Project compatibility fields (passed through; undefined = use default in export)
        workHours: task.workHours || undefined,
        taskType: task.taskType || undefined,
        constraintType: task.constraintType || undefined,
        constraintDate: task.constraintDate,
        deadline: task.deadline,
        notes: task.notes,
        effortDriven: task.effortDriven,
        estimated: task.estimated,
        ignoreResourceCalendar: task.ignoreResourceCalendar,
        priority: task.priority,
        earnedValueMethod: task.earnedValueMethod || undefined,
        dependencies: deps,
      };
    });

    // Generate XML
    const projectName = `${version.project.name} — v${version.versionNumber}`;
    const xml = generateMSPXML(mspTasks, projectName);

    // Return as downloadable XML file
    const filename = `${version.project.code || "project"}_v${version.versionNumber}.xml`;
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("MSP export failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
