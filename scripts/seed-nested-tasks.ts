import { db } from "@/lib/db";
import { recalculateWbsCodes } from "@/lib/wbs";

async function main() {
  const project = await db.project.findFirst({
    where: { name: { contains: "Kathmandu–Bhaktapur" } },
    include: { ganttTasks: true },
  });

  if (!project) {
    console.error("Project not found!");
    return;
  }

  console.log(`Found project: ${project.name} (${project.id}) with ${project.ganttTasks.length} tasks.`);

  const task1 = project.ganttTasks.find(t => t.name.includes("Site Mobilization"));
  const task5 = project.ganttTasks.find(t => t.name.includes("Box Culvert"));
  const task7 = project.ganttTasks.find(t => t.name.includes("Gabion Slope Protection"));
  const task9 = project.ganttTasks.find(t => t.name.includes("Asphalt Concrete"));

  // Clean up any existing subtasks first if needed
  await db.ganttTask.deleteMany({
    where: {
      projectId: project.id,
      parentId: { not: null },
    },
  });

  const subtasksToCreate = [];

  if (task1) {
    const s1 = new Date(task1.startDate);
    subtasksToCreate.push(
      {
        projectId: project.id,
        parentId: task1.id,
        name: "Temporary Office & Site Camp Setup",
        startDate: s1,
        endDate: new Date(s1.getTime() + 7 * 24 * 60 * 60 * 1000),
        duration: 8,
        progress: 100,
        sortOrder: 1,
      },
      {
        projectId: project.id,
        parentId: task1.id,
        name: "Plant & Heavy Equipment Mobilization",
        startDate: new Date(s1.getTime() + 4 * 24 * 60 * 60 * 1000),
        endDate: new Date(s1.getTime() + 14 * 24 * 60 * 60 * 1000),
        duration: 11,
        progress: 80,
        sortOrder: 2,
      },
      {
        projectId: project.id,
        parentId: task1.id,
        name: "Traffic Diversion & Warning Signage",
        startDate: new Date(s1.getTime() + 10 * 24 * 60 * 60 * 1000),
        endDate: new Date(s1.getTime() + 16 * 24 * 60 * 60 * 1000),
        duration: 7,
        progress: 60,
        sortOrder: 3,
      }
    );
  }

  if (task5) {
    const s5 = new Date(task5.startDate);
    subtasksToCreate.push(
      {
        projectId: project.id,
        parentId: task5.id,
        name: "Foundation Trenching & Bedding Preparation",
        startDate: s5,
        endDate: new Date(s5.getTime() + 6 * 24 * 60 * 60 * 1000),
        duration: 7,
        progress: 40,
        sortOrder: 1,
      },
      {
        projectId: project.id,
        parentId: task5.id,
        name: "RCC Bottom Slab & Apron Casting",
        startDate: new Date(s5.getTime() + 7 * 24 * 60 * 60 * 1000),
        endDate: new Date(s5.getTime() + 18 * 24 * 60 * 60 * 1000),
        duration: 12,
        progress: 25,
        sortOrder: 2,
      },
      {
        projectId: project.id,
        parentId: task5.id,
        name: "Culvert Abutment Walls & Top Deck Slab",
        startDate: new Date(s5.getTime() + 19 * 24 * 60 * 60 * 1000),
        endDate: new Date(s5.getTime() + 32 * 24 * 60 * 60 * 1000),
        duration: 14,
        progress: 0,
        sortOrder: 3,
      }
    );
  }

  if (task7) {
    const s7 = new Date(task7.startDate);
    subtasksToCreate.push(
      {
        projectId: project.id,
        parentId: task7.id,
        name: "Trench Excavation for Retaining Toe",
        startDate: s7,
        endDate: new Date(s7.getTime() + 5 * 24 * 60 * 60 * 1000),
        duration: 6,
        progress: 50,
        sortOrder: 1,
      },
      {
        projectId: project.id,
        parentId: task7.id,
        name: "Gabion Mesh Assembly & Boulder Packing",
        startDate: new Date(s7.getTime() + 6 * 24 * 60 * 60 * 1000),
        endDate: new Date(s7.getTime() + 20 * 24 * 60 * 60 * 1000),
        duration: 15,
        progress: 20,
        sortOrder: 2,
      },
      {
        projectId: project.id,
        parentId: task7.id,
        name: "Non-Woven Geotextile & Granular Backfill",
        startDate: new Date(s7.getTime() + 18 * 24 * 60 * 60 * 1000),
        endDate: new Date(s7.getTime() + 26 * 24 * 60 * 60 * 1000),
        duration: 9,
        progress: 0,
        sortOrder: 3,
      }
    );
  }

  if (task9) {
    const s9 = new Date(task9.startDate);
    subtasksToCreate.push(
      {
        projectId: project.id,
        parentId: task9.id,
        name: "Trial Section Laying & Field Density Test",
        startDate: s9,
        endDate: new Date(s9.getTime() + 3 * 24 * 60 * 60 * 1000),
        duration: 4,
        progress: 0,
        sortOrder: 1,
      },
      {
        projectId: project.id,
        parentId: task9.id,
        name: "Asphalt Concrete Wearing Course (Km 0+000 to Km 2+250)",
        startDate: new Date(s9.getTime() + 4 * 24 * 60 * 60 * 1000),
        endDate: new Date(s9.getTime() + 15 * 24 * 60 * 60 * 1000),
        duration: 12,
        progress: 0,
        sortOrder: 2,
      },
      {
        projectId: project.id,
        parentId: task9.id,
        name: "Asphalt Concrete Wearing Course (Km 2+250 to Km 4+500)",
        startDate: new Date(s9.getTime() + 16 * 24 * 60 * 60 * 1000),
        endDate: new Date(s9.getTime() + 28 * 24 * 60 * 60 * 1000),
        duration: 13,
        progress: 0,
        sortOrder: 3,
      }
    );
  }

  for (const st of subtasksToCreate) {
    await db.ganttTask.create({ data: st });
  }

  console.log(`Created ${subtasksToCreate.length} nested subtasks.`);

  await recalculateWbsCodes(project.id);
  console.log("Recalculated WBS codes successfully!");
}

main().catch(console.error).finally(() => process.exit(0));
