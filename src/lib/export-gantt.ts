import type { Task } from "@/app/(app)/projects/[id]/gantt/types";

/**
 * Export Gantt schedule to an Excel (.xlsx) file.
 *
 * NOTE: xlsx (SheetJS) is dynamically imported to keep it out of the
 * initial bundle (~516 KB). It only loads when the user actually
 * clicks Export.
 */
export async function exportGanttToXlsx(tasks: Task[], projectName?: string) {
  const XLSX = await import("xlsx");

  const rows: Record<string, unknown>[] = [];

  function flatten(tree: Task[], depth = 0) {
    for (const t of tree) {
      const children = tree.filter((c) => c.parentId === t.id);
      const deps = t.predecessors?.map((p) => p.predecessorId).join(", ") ?? "";
      rows.push({
        Level: depth + 1,
        Code: t.code ?? "",
        Name: t.name,
        "Start Date": t.startDate ? new Date(t.startDate).toLocaleDateString() : "",
        "End Date": t.endDate ? new Date(t.endDate).toLocaleDateString() : "",
        "Actual Start": t.actualStartDate ? new Date(t.actualStartDate).toLocaleDateString() : "",
        "Actual End": t.actualEndDate ? new Date(t.actualEndDate).toLocaleDateString() : "",
        Duration: t.duration,
        Progress: `${t.progress}%`,
        Cost: t.plannedValue,
        "Labor Count": t.laborCount,
        Milestone: t.isMilestone ? "Yes" : "No",
        Predecessors: deps,
        "BOQ Links": t.boqLinks?.length ?? 0,
      });
      if (children.length > 0) flatten(children, depth + 1);
    }
  }

  const roots = tasks.filter((t) => !t.parentId);
  flatten(roots);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 5 },   // Level
    { wch: 10 },  // Code
    { wch: 40 },  // Name
    { wch: 14 },  // Start Date
    { wch: 14 },  // End Date
    { wch: 14 },  // Actual Start
    { wch: 14 },  // Actual End
    { wch: 8 },   // Duration
    { wch: 10 },  // Progress
    { wch: 14 },  // Cost
    { wch: 10 },  // Labor Count
    { wch: 10 },  // Milestone
    { wch: 30 },  // Predecessors
    { wch: 10 },  // BOQ Links
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Schedule");
  const filename = projectName
    ? `${projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Gantt.xlsx`
    : "Gantt_Schedule.xlsx";

  XLSX.writeFile(wb, filename);
}
