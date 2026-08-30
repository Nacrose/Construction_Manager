import { db, type DbTxClient } from "@/lib/db";

/**
 * Recalculate WBS (Work Breakdown Structure) codes for all tasks in a project.
 * Walks the task tree depth-first and assigns codes like:
 *   1, 1.1, 1.1.1, 1.1.2, 1.2, 2, 2.1, ...
 *
 * Codes are stored on the `code` field of GanttTask.
 * Call this after any create/update/delete that affects tree structure or sibling order.
 *
 * All updates are wrapped in a single transaction so that if any update
 * fails, the entire WBS recalculation is rolled back — no partial
 * state with some tasks having new codes and others having old ones.
 *
 * RLS: GanttTask is FORCE-scoped. On the pooled client this only works
 * while the best-effort session-level org GUC is set — prefer passing a
 * `tx` from a context-pinned transaction (`withTenantTx` / `withOrgContext`).
 */
export async function recalculateWbsCodes(
  projectId: string,
  versionId?: string | null,
  tx?: DbTxClient
): Promise<void> {
  const client = tx ?? db;
  const whereClause = versionId
    ? { projectId, versionId }
    : { projectId };

  const tasks = await client.ganttTask.findMany({
    where: whereClause,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, parentId: true, sortOrder: true, versionId: true },
  });

  // Group tasks by versionId so version trees are completely isolated
  const byVersion = new Map<string | null, typeof tasks>();
  for (const t of tasks) {
    const vKey = t.versionId ?? null;
    const vArr = byVersion.get(vKey) ?? [];
    vArr.push(t);
    byVersion.set(vKey, vArr);
  }

  // Collect all updates to apply in a single transaction
  const updates: Array<{ id: string; code: string }> = [];

  for (const versionTasks of byVersion.values()) {
    // Group children by parent (null = root) for this version
    const byParent = new Map<string | null, typeof versionTasks>();
    for (const t of versionTasks) {
      const key = t.parentId ?? null;
      const arr = byParent.get(key) ?? [];
      arr.push(t);
      byParent.set(key, arr);
    }

    // Sort each sibling group by sortOrder
    for (const arr of byParent.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // Walk depth-first, collect code assignments
    function walk(parentId: string | null, prefix: string) {
      const children = byParent.get(parentId) ?? [];
      children.forEach((child, idx) => {
        const code = prefix ? `${prefix}.${idx + 1}` : String(idx + 1);
        updates.push({ id: child.id, code });
        walk(child.id, code);
      });
    }
    walk(null, "");
  }

  // Apply all code updates in a single transaction (or inside the caller's).
  if (updates.length > 0) {
    if (tx) {
      for (const u of updates) {
        await tx.ganttTask.update({ where: { id: u.id }, data: { code: u.code } });
      }
    } else {
      await db.$transaction(
        updates.map((u) =>
          db.ganttTask.update({ where: { id: u.id }, data: { code: u.code } })
        )
      );
    }
  }
}
