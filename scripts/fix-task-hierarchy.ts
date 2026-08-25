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

  console.log(`Fixing hierarchy for project: ${project.name}`);

  // 1. Fix root-level tasks parentId and sortOrder
  const rootOrder = [
    "Site Mobilization & Establishment",
    "Topographical Survey & Joint Measurement",
    "Site Clearing, Grubbing & Earth Excavation",
    "Granular Sub-Base (GSB) Construction",
    "Double Cell Box Culvert & Cross Drainage",
    "Crusher Run Base Course (WBM/WMM)",
    "Gabion Slope Protection & Retaining Walls",
    "Bituminous Prime Coat & Tack Coat",
    "Asphalt Concrete Wearing Course Paving",
    "Road Safety Furniture & Thermoplastic Markings",
    "Final Inspection & Commissioning",
  ];

  for (let i = 0; i < rootOrder.length; i++) {
    const nameMatch = rootOrder[i];
    const task = project.ganttTasks.find(t => t.name.includes(nameMatch) && !t.name.includes("Subtask"));
    if (task) {
      await db.ganttTask.update({
        where: { id: task.id },
        data: {
          parentId: null,
          sortOrder: i + 1,
        },
      });
      console.log(`Updated root task [${i + 1}] ${task.name}`);
    }
  }

  // 2. Ensure subtasks have parentId and proper sortOrder
  const task1 = project.ganttTasks.find(t => t.name === "Site Mobilization & Establishment");
  const task5 = project.ganttTasks.find(t => t.name === "Double Cell Box Culvert & Cross Drainage");
  const task7 = project.ganttTasks.find(t => t.name === "Gabion Slope Protection & Retaining Walls");
  const task9 = project.ganttTasks.find(t => t.name === "Asphalt Concrete Wearing Course Paving");

  if (task1) {
    const sub1 = await db.ganttTask.findMany({ where: { parentId: task1.id }, orderBy: { createdAt: "asc" } });
    for (let j = 0; j < sub1.length; j++) {
      await db.ganttTask.update({ where: { id: sub1[j].id }, data: { sortOrder: j + 1 } });
    }
  }

  if (task5) {
    const sub5 = await db.ganttTask.findMany({ where: { parentId: task5.id }, orderBy: { createdAt: "asc" } });
    for (let j = 0; j < sub5.length; j++) {
      await db.ganttTask.update({ where: { id: sub5[j].id }, data: { sortOrder: j + 1 } });
    }
  }

  if (task7) {
    const sub7 = await db.ganttTask.findMany({ where: { parentId: task7.id }, orderBy: { createdAt: "asc" } });
    for (let j = 0; j < sub7.length; j++) {
      await db.ganttTask.update({ where: { id: sub7[j].id }, data: { sortOrder: j + 1 } });
    }
  }

  if (task9) {
    const sub9 = await db.ganttTask.findMany({ where: { parentId: task9.id }, orderBy: { createdAt: "asc" } });
    for (let j = 0; j < sub9.length; j++) {
      await db.ganttTask.update({ where: { id: sub9[j].id }, data: { sortOrder: j + 1 } });
    }
  }

  // 3. Recalculate WBS
  await recalculateWbsCodes(project.id);
  console.log("Hierarchy cleanly rebuilt and WBS codes recalculated!");
}

main().catch(console.error).finally(() => process.exit(0));
