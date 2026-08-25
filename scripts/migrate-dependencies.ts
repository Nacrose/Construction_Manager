#!/usr/bin/env node
/**
 * Migration script: Migrate legacy JSON dependencies to TaskDependency table
 * 
 * Run with: npx tsx scripts/migrate-dependencies.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateDependencies() {
  console.log("🔍 Fetching all Gantt tasks with legacy dependencies...");

  const tasks = await prisma.ganttTask.findMany({
    where: {
      dependencies: { not: null, not: "" as any },
    },
    select: { id: true, projectId: true, dependencies: true },
  });

  console.log(`Found ${tasks.length} tasks with legacy dependencies.`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const task of tasks) {
    if (!task.dependencies) continue;

    try {
      const deps = JSON.parse(task.dependencies);
      if (!Array.isArray(deps) || deps.length === 0) {
        skipped++;
        continue;
      }

      let migratedCount = 0;
      for (const dep of deps) {
        if (!dep.taskId) continue;

        await prisma.taskDependency.upsert({
          where: {
            predecessorId_successorId: {
              predecessorId: dep.taskId,
              successorId: task.id,
            },
          },
          update: {
            type: dep.type ?? "FS",
            offset: dep.offset ?? 0,
          },
          create: {
            predecessorId: dep.taskId,
            successorId: task.id,
            type: dep.type ?? "FS",
            offset: dep.offset ?? 0,
          },
        });
        migratedCount++;
      }

      if (migratedCount > 0) {
        console.log(`  ✓ Task ${task.id}: migrated ${migratedCount} dependencies`);
        migrated++;
      }
    } catch (e) {
      console.error(`  ✗ Task ${task.id}: failed to migrate`, e);
      errors++;
    }
  }

  console.log(`\n📊 Migration complete:`);
  console.log(`  Migrated: ${migrated} tasks`);
  console.log(`  Skipped:  ${skipped} tasks`);
  console.log(`  Errors:   ${errors} tasks`);
}

async function verifyMigration() {
  console.log("\n🔍 Verifying migration...");

  const totalDeps = await prisma.taskDependency.count();
  console.log(`Total dependencies in TaskDependency table: ${totalDeps}`);

  const tasksWithPredecessors = await prisma.ganttTask.count({
    where: { predecessors: { some: {} } },
  });
  console.log(`Tasks with predecessors: ${tasksWithPredecessors}`);

  // Check a sample
  const sample = await prisma.ganttTask.findFirst({
    where: { predecessors: { some: {} } },
    include: { predecessors: true },
  });
  if (sample) {
    console.log(`Sample task ${sample.id}: ${sample.predecessors.length} predecessors`);
  }
}

migrateDependencies()
  .then(() => verifyMigration())
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });