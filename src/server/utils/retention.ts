/**
 * Shared retention computation — the single source of truth for how much
 * retention is held vs released for a subcontractor.
 *
 * WHY THIS EXISTS (bug cluster fix):
 *
 * 1. `subcontractor.totalRetentionHeld` was NEVER written anywhere in the
 *    codebase, so `releaseRetention`'s over-release guard computed
 *    `held = 0 - released <= 0` and rejected EVERY release attempt — the
 *    feature was unusable. The held amount is now computed LIVE from the
 *    source rows (subcontractor bills + subcontractor IPCs), which cannot
 *    drift the way a denormalized column can. `totalRetentionHeld` is a
 *    legacy column and is no longer read.
 *
 * 2. Two uncoordinated release paths existed:
 *      - project-ops.releaseRetention: ad-hoc release payment (Payment row
 *        with retentionReleased > 0) + bump of sub.totalRetentionReleased
 *      - financial-reporting.releaseRetention: bulk release at project
 *        completion, tracking ONLY ipc/bill.retentionReleasedAt markers
 *    Neither saw the other's state → a partial payment release was
 *    double-released by the bulk path, and bulk releases were invisible to
 *    the payment path's guard. Both paths now share THIS helper plus one
 *    release tracker (`subcontractor.totalRetentionReleased`), and the bulk
 *    path reconciles against payment history (see financial-reporting.ts).
 *
 * HELD semantics: retention counts as held once its source row leaves
 * draft — a submitted bill / submitted subcontractor IPC is a real
 * receivable against which money is being withheld. Client-facing IPCs
 * (subcontractorId = null) are retention RECEIVABLE, not payable, and are
 * out of scope here.
 */
import { db } from "@/lib/db";

/** Bill statuses at which the deducted retention is real (held). */
export const RETENTION_HELD_BILL_STATUSES = ["submitted", "verified", "certified", "paid"] as const;

/** Subcontractor-IPC statuses at which the deducted retention is real (held).
 *  Client IPCs share the same enum but are handled by the client-side ledger. */
export const RETENTION_HELD_IPC_STATUSES = ["submitted", "certified", "approved", "paid"] as const;

const BOUNDED = 1000; // bounded reads (pagination sweep convention) — see src/lib/pagination.ts

export type RetentionSourceRow = {
  id: string;
  kind: "bill" | "ipc";
  number: string;
  retentionAmount: number;
  releasedAt: Date | null;
  /** Stable FIFO ordering key (bill/ipc creation or issue date). */
  orderedAt: Date;
};

export type SubcontractorRetentionPosition = {
  /** Σ retention on held source rows (bills + sub-IPCs). */
  heldRetention: number;
  /** Σ retention on source rows explicitly marked released (bulk path). */
  markedReleased: number;
  /** The single release tracker — maintained by BOTH release paths. */
  releasedTotal: number;
  /** heldRetention − releasedTotal. May be negative on bad historical data. */
  outstandingHeld: number;
  /** Held source rows, FIFO-ordered (oldest first). */
  rows: RetentionSourceRow[];
};

/**
 * Bulk-compute retention positions for every subcontractor on a project
 * (3 bounded queries total, not per-sub N+1). Pass `subcontractorId` to
 * scope to a single subcontractor.
 */
export async function computeSubRetention(
  projectId: string,
  subcontractorId?: string,
): Promise<Map<string, SubcontractorRetentionPosition>> {
  const [bills, ipcs, subs] = await Promise.all([
    db.subcontractorBill.findMany({
      where: {
        projectId,
        retentionAmount: { gt: 0 },
        status: { in: [...RETENTION_HELD_BILL_STATUSES] },
        ...(subcontractorId ? { subcontractorId } : {}),
      },
      select: {
        id: true, number: true, retentionAmount: true,
        retentionReleasedAt: true, createdAt: true, subcontractorId: true,
      },
      take: BOUNDED, // bounded (pagination sweep) — see src/lib/pagination.ts
    }),
    db.ipc.findMany({
      where: {
        projectId,
        subcontractorId: { not: null },
        retentionAmount: { gt: 0 },
        status: { in: [...RETENTION_HELD_IPC_STATUSES] },
        ...(subcontractorId ? { subcontractorId } : {}),
      },
      select: {
        id: true, number: true, retentionAmount: true,
        retentionReleasedAt: true, createdAt: true, subcontractorId: true,
      },
      take: BOUNDED, // bounded (pagination sweep) — see src/lib/pagination.ts
    }),
    db.subcontractor.findMany({
      where: { projectId, ...(subcontractorId ? { id: subcontractorId } : {}) },
      select: { id: true, totalRetentionReleased: true },
      take: BOUNDED, // bounded (pagination sweep) — see src/lib/pagination.ts
    }),
  ]);

  const positions = new Map<string, SubcontractorRetentionPosition>();
  for (const s of subs) {
    positions.set(s.id, {
      heldRetention: 0,
      markedReleased: 0,
      releasedTotal: s.totalRetentionReleased || 0,
      outstandingHeld: 0,
      rows: [],
    });
  }

  const addRow = (subId: string | null, row: RetentionSourceRow) => {
    if (!subId) return;
    let pos = positions.get(subId);
    if (!pos) {
      // Sub rows exist even when the subcontractor lookup was scoped out.
      pos = { heldRetention: 0, markedReleased: 0, releasedTotal: 0, outstandingHeld: 0, rows: [] };
      positions.set(subId, pos);
    }
    pos.heldRetention += row.retentionAmount;
    if (row.releasedAt) pos.markedReleased += row.retentionAmount;
    pos.rows.push(row);
  };

  for (const b of bills) {
    addRow(b.subcontractorId, {
      id: b.id,
      kind: "bill",
      number: b.number,
      retentionAmount: b.retentionAmount,
      releasedAt: b.retentionReleasedAt,
      orderedAt: b.createdAt,
    });
  }
  for (const i of ipcs) {
    addRow(i.subcontractorId, {
      id: i.id,
      kind: "ipc",
      number: i.number,
      retentionAmount: i.retentionAmount,
      releasedAt: i.retentionReleasedAt,
      orderedAt: i.createdAt,
    });
  }

  for (const pos of positions.values()) {
    pos.rows.sort((a, b) => a.orderedAt.getTime() - b.orderedAt.getTime());
    pos.outstandingHeld = pos.heldRetention - pos.releasedTotal;
  }

  return positions;
}

/** Convenience wrapper for a single subcontractor (guard checks, detail views). */
export async function computeSingleSubRetention(
  projectId: string,
  subcontractorId: string,
): Promise<SubcontractorRetentionPosition> {
  const positions = await computeSubRetention(projectId, subcontractorId);
  return (
    positions.get(subcontractorId) ?? {
      heldRetention: 0,
      markedReleased: 0,
      releasedTotal: 0,
      outstandingHeld: 0,
      rows: [],
    }
  );
}
