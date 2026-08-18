import { db } from "@/lib/db";

/**
 * Recalculate WBS (Work Breakdown Structure) codes for all tasks in a project.
 * Walks the task tree depth-first and assigns codes like:
 *   1, 1.1, 1.1.1, 1.1.2, 1.2, 2, 2.1, ...
 *
 * Codes are stored on the `code` field of GanttTask.
 * Call this after any create/update/delete that affects tree structure or sibling order.
 */
export async function recalculateWbsCodes(projectId: string): Promise<void> {
  const tasks = await db.ganttTask.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, parentId: true, sortOrder: true },
  });

  // Group children by parent (null = root)
  const byParent = new Map<string | null, typeof tasks>();
  for (const t of tasks) {
    const key = t.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(t);
    byParent.set(key, arr);
  }

  // Sort each group by sortOrder (already sorted from query, but be safe)
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Walk depth-first, assign codes
  const updates: Promise<unknown>[] = [];
  function walk(parentId: string | null, prefix: string) {
    const children = byParent.get(parentId) ?? [];
    children.forEach((child, idx) => {
      const code = prefix ? `${prefix}.${idx + 1}` : String(idx + 1);
      updates.push(
        db.ganttTask.update({ where: { id: child.id }, data: { code } }),
      );
      walk(child.id, code);
    });
  }
  walk(null, "");

  await Promise.all(updates);
}
