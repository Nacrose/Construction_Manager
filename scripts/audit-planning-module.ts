import { db } from "../src/lib/db";
import { Prisma } from "@prisma/client";

async function main() {
  console.log("=== PLANNING & SCHEDULE MODULE DEEP AUDIT ===");

  // 1. Projects and Gantt Versions
  const totalProjects = await db.project.count();
  const totalGanttVersions = await db.ganttVersion.count();
  const planningVersions = await db.ganttVersion.count({ where: { scheduleType: "PLANNING" } });
  const executionVersions = await db.ganttVersion.count({ where: { scheduleType: "EXECUTION" } });
  console.log("Project & Version Overview:", {
    totalProjects,
    totalGanttVersions,
    planningVersions,
    executionVersions,
  });

  // 2. Tasks count and structure
  const totalTasks = await db.ganttTask.count();
  const parentTasks = await db.ganttTask.count({ where: { children: { some: {} } } });
  const milestoneTasks = await db.ganttTask.count({ where: { isMilestone: true } });
  const rootTasks = await db.ganttTask.count({ where: { parentId: null } });
  console.log("Task Distribution:", {
    totalTasks,
    parentTasks,
    milestoneTasks,
    rootTasks,
  });

  // 3. Task Parent-Child Integrity
  const orphanedTasks = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int as count FROM "GanttTask" gt
    LEFT JOIN "GanttTask" parent ON parent.id = gt."parentId"
    WHERE gt."parentId" IS NOT NULL AND parent.id IS NULL
  `);
  console.log("Orphaned Tasks (parentId not found):", orphanedTasks);

  // 4. Dependencies Integrity
  const totalDependencies = await db.taskDependency.count();
  const orphanedDeps = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int as count FROM "TaskDependency" td
    LEFT JOIN "GanttTask" succ ON succ.id = td."successorId"
    LEFT JOIN "GanttTask" pred ON pred.id = td."predecessorId"
    WHERE succ.id IS NULL OR pred.id IS NULL
  `);
  console.log("Dependency Count & Orphaned Dependencies:", {
    totalDependencies,
    orphanedDeps,
  });

  // 5. Check for direct self-dependencies (Task depends on itself)
  const selfDeps = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int as count FROM "TaskDependency" WHERE "successorId" = "predecessorId"
  `);
  console.log("Self Dependencies (Task depends on itself):", selfDeps);

  // 6. BoQ Linkage Integrity
  const totalBoqLinks = await db.taskBoqLink.count();
  console.log("BOQ Task Linkages:", {
    totalBoqLinks,
  });

  // 7. Revision Document & Baseline Integrity
  const revisionsWithValidBase = await db.ganttVersion.count({
    where: { baseVersionId: { not: null } },
  });
  console.log("Revisions linked to base versions:", revisionsWithValidBase);

  // 8. Test calculation for active projects
  const activeProjects = await db.project.findMany({
    select: { id: true, name: true, code: true },
    take: 5,
  });

  for (const proj of activeProjects) {
    const taskCount = await db.ganttTask.count({ where: { projectId: proj.id } });
    const versionCount = await db.ganttVersion.count({ where: { projectId: proj.id } });
    console.log(`Project "${proj.name}" (${proj.code}):`, {
      tasks: taskCount,
      versions: versionCount,
    });
  }
}

main().catch(console.error).finally(() => process.exit(0));
