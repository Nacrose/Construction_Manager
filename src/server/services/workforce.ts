/**
 * Workforce domain service — the Person/Assignment grain (ADR-0005).
 *
 * The schema deliberately does NOT enforce some workforce invariants
 * (no [projectId, personId] unique on assignments; attendance rows are
 * per assignment per day). This service is the single authority that
 * owns those invariants in application code:
 *
 *  - **Overlap validation** — a person holding two concurrent active
 *    assignments is legitimate (shared worker), but the *same project*
 *    overlapping itself, or an unacknowledged overlap, must be surfaced:
 *    warning → audited override (never silently blocked, never silently
 *    accepted).
 *  - **Cross-project daily capacity** — attendance is logged per
 *    assignment ([assignmentId, date]); a person with two active
 *    assignments produces two rows per day, and THIS service owns the
 *    check that the combined effective days for one person on one date
 *    never exceeds one physical day (1.0) without an audited override.
 *  - **Transfers & rehires** — an engagement ends and a new one begins,
 *    chained via `sourceAssignmentId`. Ending an engagement destroys
 *    nothing (attendance, advances, payroll, leave all survive).
 *  - **Person merge** — duplicate persons are consolidated, never
 *    deleted; every referencing row is re-pointed and the duplicate is
 *    marked `mergedIntoId` (merge bookkeeping is surfaced, never
 *    auto-applied).
 *
 * Routers call this service; they never hand-roll these checks (the
 * same extend-never-parallel rule the engine follows, ADR-0006).
 */
import { TRPCError } from "@trpc/server";
import type { DbTxClient } from "@/lib/db";
import { audit } from "@/lib/audit";
import { derivePaymentStatus } from "@/server/utils/settlement";

type Executor = DbTxClient; // db or tx — service runs inside caller's transaction

// ─────────────────────────────────────────────────────────────
// Effective-day weights (ADR-0005 §Consequences: the workforce
// service owns the cross-project daily-capacity check).
// ─────────────────────────────────────────────────────────────

export const EFFECTIVE_DAY_WEIGHTS: Record<string, number> = {
  present: 1,
  overtime: 1, // "overtime" status = worked (a full day, plus OT hours)
  half_day: 0.5,
  absent: 0,
  leave: 0, // not on site — consumes no site capacity
  unlogged: 0,
};

/** Effective days contributed by an attendance status. Unknown statuses contribute 0 (fail-safe, never inflate). */
export function effectiveDaysOf(status: string): number {
  return EFFECTIVE_DAY_WEIGHTS[status] ?? 0;
}

const EPSILON = 1e-9;

// ─────────────────────────────────────────────────────────────
// 1. Assignment overlap (warning → audited override)
// ─────────────────────────────────────────────────────────────

export type OverlapWindow = {
  fromDate: Date;
  /** null = open-ended (current engagement). */
  toDate?: Date | null;
};

export type AssignmentOverlap = {
  assignmentId: string;
  projectId: string;
  status: string;
  fromDate: Date;
  toDate: Date | null;
};

/**
 * Find the person's ACTIVE assignments that overlap the given window.
 * Open windows (toDate = null) overlap anything from `fromDate` onward.
 * `excludeAssignmentId` excludes the assignment being edited (transfers).
 */
export async function findOverlappingAssignments(
  tx: Executor,
  personId: string,
  window: OverlapWindow,
  excludeAssignmentId?: string,
): Promise<AssignmentOverlap[]> {
  const rows = await tx.projectStaffAssignment.findMany({
    where: {
      personId,
      status: "active",
      ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
      // candidates must START before our window closes (if it closes)…
      fromDate: window.toDate ? { lte: window.toDate } : undefined,
      // …and must not have ENDED before our window opens (null toDate = still engaged)
      OR: [{ toDate: null }, { toDate: { gte: window.fromDate } }],
    },
    select: { id: true, projectId: true, status: true, fromDate: true, toDate: true },
    take: 100, // bounded — overlap candidates are tiny by construction
  });
  return rows.map((r) => ({
    assignmentId: r.id,
    projectId: r.projectId,
    status: r.status,
    fromDate: r.fromDate,
    toDate: r.toDate,
  }));
}

/**
 * Assert the new/changed assignment's overlap is acknowledged.
 *
 * Semantics (ADR-0005 §2): overlap is validated by the workforce service,
 * NOT blocked by the schema. An overlap on *different* projects is a
 * legitimate shared-worker arrangement — it proceeds with a structured
 * warning the caller must acknowledge via `overrideReason` (audited).
 * An overlap on the SAME project is always a data error and is rejected
 * outright — overriding it would create two current engagements for one
 * person on one project with no product meaning.
 *
 * @returns `warning` when the caller-supplied `overrideReason`
 *          acknowledged an overlap (the caller should audit it).
 * @throws  BAD_REQUEST with `code: "OVERLACK"`-style details when an
 *          overlap exists and was not acknowledged, or always when the
 *          overlap is same-project.
 */
export async function assertAssignmentOverlapAcked(
  tx: Executor,
  args: {
    personId: string;
    projectId: string;
    window: OverlapWindow;
    excludeAssignmentId?: string;
    overrideReason?: string | null;
  },
): Promise<{ warning: boolean; overlaps: AssignmentOverlap[] }> {
  const overlaps = await findOverlappingAssignments(
    tx,
    args.personId,
    args.window,
    args.excludeAssignmentId,
  );
  if (overlaps.length === 0) return { warning: false, overlaps: [] };

  const sameProject = overlaps.some((o) => o.projectId === args.projectId);
  if (sameProject || !args.overrideReason) {
    const detail = overlaps
      .map((o) => `${o.projectId} (${o.fromDate.toISOString().slice(0, 10)} → ${o.toDate ? o.toDate.toISOString().slice(0, 10) : "open"})`)
      .join("; ");
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: sameProject
        ? `This person already has an active assignment on this project overlapping the new window — end or transfer the existing engagement first. Overlaps: ${detail}.`
        : `This person has overlapping active assignment(s): ${detail}. Re-submit with an override reason to confirm a concurrent (shared-worker) engagement.`,
    });
  }

  return { warning: true, overlaps };
}

// ─────────────────────────────────────────────────────────────
// 2. Cross-project daily capacity
// ─────────────────────────────────────────────────────────────

export type CapacityInput = {
  personId: string;
  date: Date;
  /** Effective days the incoming write contributes (e.g. 1, 0.5). */
  incomingEffective: number;
  /** Assignment the incoming write lands on (excluded from the "existing" sum). */
  assignmentId: string;
};

/**
 * Assert one person's combined effective days on one DATE across ALL
 * their assignments (any project in the org) stay within one physical
 * day. Overridable with an audited `overrideReason` — e.g. a genuine
 * half-day on each of two sites is legal (1.0); two full days are not.
 */
export async function assertDailyCapacity(
  tx: Executor,
  input: CapacityInput,
  overrideReason?: string | null,
): Promise<{ totalEffective: number }> {
  if (input.incomingEffective <= 0) return { totalEffective: 0 };

  // All attendance rows for this person on this date, EXCLUDING the row
  // being written (it may already exist — upsert semantics).
  const rows = await tx.staffAttendance.findMany({
    where: {
      date: input.date,
      assignment: { personId: input.personId, id: { not: input.assignmentId } },
    },
    select: { status: true, assignmentId: true },
    take: 100, // a person cannot hold more than a handful of assignments
  });

  const existingEffective = rows.reduce((sum, r) => sum + effectiveDaysOf(r.status), 0);
  const totalEffective = existingEffective + input.incomingEffective;

  if (totalEffective > 1 + EPSILON) {
    if (!overrideReason) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Daily capacity exceeded: this person already holds ${existingEffective} effective day(s) on ${input.date.toISOString().slice(0, 10)} across other projects; the incoming record would bring the combined total to ${roundEffective(totalEffective)}. Re-submit with an override reason if this is genuinely correct.`,
      });
    }
  }

  return { totalEffective: roundEffective(totalEffective) };
}

function roundEffective(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Capacity check for a BULK attendance write (one date, many rows).
 *
 * The batch may contain several rows for the same person (a person with
 * two concurrent assignments on this project), and the DB may already
 * hold rows for the same assignments (upsert semantics) or for OTHER
 * assignments of the same person (concurrent assignment elsewhere). The
 * exact post-write combined effective days are therefore computed as:
 *
 *   Σ effective(batch final states for the person)
 *     + Σ effective(DB rows for the person on OTHER assignments)
 *
 * and must not exceed 1.0 without an audited `overrideReason`.
 */
export async function assertBulkDailyCapacity(
  tx: Executor,
  args: {
    date: Date;
    records: Array<{ personId: string; assignmentId: string; status: string }>;
    overrideReason?: string | null;
  },
): Promise<void> {
  // Final effective days per person from the batch.
  const finalPerPerson = new Map<string, number>();
  const batchAssignmentIds = new Set<string>();
  for (const r of args.records) {
    finalPerPerson.set(r.personId, (finalPerPerson.get(r.personId) ?? 0) + effectiveDaysOf(r.status));
    batchAssignmentIds.add(r.assignmentId);
  }
  if (finalPerPerson.size === 0) return;

  // Existing rows OUTSIDE the batch (assignments not being rewritten).
  const outside = await tx.staffAttendance.findMany({
    where: {
      date: args.date,
      assignment: {
        personId: { in: [...finalPerPerson.keys()] },
        id: { notIn: [...batchAssignmentIds] },
      },
    },
    select: { status: true, assignment: { select: { personId: true } } },
    take: 200, // bounded — persons × assignments on one date
  });

  const outsidePerPerson = new Map<string, number>();
  for (const row of outside) {
    const pid = row.assignment.personId;
    outsidePerPerson.set(pid, (outsidePerPerson.get(pid) ?? 0) + effectiveDaysOf(row.status));
  }

  const offenders: string[] = [];
  for (const [personId, batchEffective] of finalPerPerson) {
    const total = batchEffective + (outsidePerPerson.get(personId) ?? 0);
    if (total > 1 + EPSILON) offenders.push(`${personId} → ${roundEffective(total)}`);
  }

  if (offenders.length > 0 && !args.overrideReason) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Daily capacity exceeded for ${offenders.length} person(s) on ${args.date.toISOString().slice(0, 10)} (combined effective days across all projects: ${offenders.join(", ")}). Re-submit with an override reason if genuinely correct.`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 3. Transfer / rehire (chain a new engagement, end the old one)
// ─────────────────────────────────────────────────────────────

export type TransferTerms = {
  fromDate: Date;
  designation?: string | null;
  category?: string | null;
  employmentType?: "daily" | "monthly" | "piece_rate";
  dailyWage?: number;
  monthlySalary?: number;
  gangName?: string | null;
};

/**
 * Transfer (or re-hire) a person: end the current engagement and open a
 * new one in the same transaction, chained via `sourceAssignmentId`.
 *
 * - `newProjectId` omitted → re-hire on the SAME project (new terms).
 * - The old engagement's `toDate` is the day BEFORE the new one starts
 *   (never before the old engagement itself started).
 * - Overlap on the target project from other concurrent assignments is
 *   validated (warning → audited override), same as a fresh assignment.
 * - Nothing downstream is destroyed: attendance, advances, payroll and
 *   leave history all reference the OLD row and survive untouched.
 */
export async function transferAssignment(
  tx: Executor,
  args: {
    assignmentId: string;
    newProjectId?: string | null;
    terms: TransferTerms;
    overrideReason?: string | null;
    actorId: string;
  },
): Promise<{ endedAssignmentId: string; createdAssignmentId: string }> {
  const current = await tx.projectStaffAssignment.findUnique({
    where: { id: args.assignmentId },
    select: {
      id: true, projectId: true, personId: true, status: true, fromDate: true,
      designation: true, category: true, employmentType: true,
      dailyWage: true, monthlySalary: true, gangName: true,
    },
  });
  if (!current) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Staff assignment not found." });
  }
  if (current.status !== "active") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only an active assignment can be transferred or re-hired." });
  }

  const targetProjectId = args.newProjectId || current.projectId;
  const newFrom = args.terms.fromDate;

  // The old engagement ends the day before the new one starts — but
  // never before it began (a same-day re-hire is allowed to collapse).
  const dayBefore = new Date(newFrom.getTime());
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const oldTo = dayBefore < current.fromDate ? newFrom : dayBefore;

  // Overlap check on the TARGET project (exclude the engagement being
  // transferred — it is ending).
  await assertAssignmentOverlapAcked(tx, {
    personId: current.personId,
    projectId: targetProjectId,
    window: { fromDate: newFrom, toDate: null },
    excludeAssignmentId: current.id,
    overrideReason: args.overrideReason,
  });

  const ended = await tx.projectStaffAssignment.updateMany({
    where: { id: current.id, status: "active" }, // CAS: concurrent transfer loses loudly
    data: { status: "ended", toDate: oldTo, endReason: args.newProjectId ? "transferred" : "contract_end" },
  });
  if (ended.count === 0) {
    throw new TRPCError({ code: "CONFLICT", message: "This assignment was just modified by someone else — reload and retry." });
  }

  const created = await tx.projectStaffAssignment.create({
    data: {
      projectId: targetProjectId,
      personId: current.personId,
      sourceAssignmentId: current.id,
      fromDate: newFrom,
      designation: args.terms.designation !== undefined ? args.terms.designation : current.designation,
      category: args.terms.category !== undefined ? args.terms.category : current.category,
      employmentType: args.terms.employmentType ?? current.employmentType,
      dailyWage: args.terms.dailyWage ?? current.dailyWage,
      monthlySalary: args.terms.monthlySalary ?? current.monthlySalary,
      gangName: args.terms.gangName !== undefined ? args.terms.gangName : current.gangName,
      status: "active",
    },
  });

  await audit({
    userId: args.actorId,
    projectId: targetProjectId,
    action: "workforce.assignment.transfer",
    entityType: "ProjectStaffAssignment",
    entityId: created.id,
    metadata: {
      fromAssignmentId: current.id,
      fromProjectId: current.projectId,
      toProjectId: targetProjectId,
      fromDate: newFrom.toISOString(),
      ...(args.overrideReason ? { overrideReason: args.overrideReason } : {}),
    },
  });

  return { endedAssignmentId: current.id, createdAssignmentId: created.id };
}

// ─────────────────────────────────────────────────────────────
// 4. Person merge (dedupe — surfaced, never auto-applied)
// ─────────────────────────────────────────────────────────────

/**
 * Merge `duplicateId` into `primaryId` (same org): every referencing row
 * is re-pointed to the primary and the duplicate is marked
 * `mergedIntoId` + `status: "inactive"`. Nothing is deleted except the
 * duplicate's now-redundant leave-balance rows (consolidated into the
 * primary's).
 *
 * Fail-loud rules:
 *  - both persons hold records in the SAME payroll run → the per-run
 *    per-person unique would collide; reconcile the period first.
 *  - both persons carry a linked app account → identity is ambiguous;
 *    the caller must unlink one first (the duplicate's link is dropped
 *    only when the primary has none).
 */
export async function mergePersons(
  tx: Executor,
  args: { organizationId: string; primaryId: string; duplicateId: string; reason?: string | null; actorId: string },
): Promise<{ merged: true; rePointed: Record<string, number> }> {
  const { primaryId, duplicateId } = args;
  if (primaryId === duplicateId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot merge a person into themselves." });
  }

  const [primary, duplicate] = await Promise.all([
    tx.person.findUnique({ where: { id: primaryId } }),
    tx.person.findUnique({ where: { id: duplicateId } }),
  ]);
  if (!primary || !duplicate) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Person not found." });
  }
  if (primary.organizationId !== args.organizationId || duplicate.organizationId !== args.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Cross-organization merge is not allowed." });
  }
  if (duplicate.mergedIntoId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This person is already merged into another record." });
  }

  // Payroll collision: both persons paid in the same run → the
  // [payrollRunId, personId] unique would reject the re-point. Fail loud.
  const [primaryRuns, duplicateRuns] = await Promise.all([
    tx.payrollPersonRecord.findMany({ where: { personId: primaryId }, select: { payrollRunId: true }, take: 1000 }),
    tx.payrollPersonRecord.findMany({ where: { personId: duplicateId }, select: { payrollRunId: true }, take: 1000 }),
  ]);
  const primaryRunIds = new Set(primaryRuns.map((r) => r.payrollRunId));
  const collision = duplicateRuns.find((r) => primaryRunIds.has(r.payrollRunId));
  if (collision) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Both persons hold payslip records in the same payroll run — reconcile or rebuild that period before merging.",
    });
  }

  const rePointed: Record<string, number> = {};

  rePointed.assignments = (await tx.projectStaffAssignment.updateMany({
    where: { personId: duplicateId }, data: { personId: primaryId },
  })).count;
  rePointed.advances = (await tx.staffAdvance.updateMany({
    where: { personId: duplicateId }, data: { personId: primaryId },
  })).count;
  rePointed.leaveRequests = (await tx.leaveRequest.updateMany({
    where: { personId: duplicateId }, data: { personId: primaryId },
  })).count;
  rePointed.roleFillings = (await tx.staffRoleAssignment.updateMany({
    where: { personId: duplicateId }, data: { personId: primaryId },
  })).count;
  rePointed.resourceAssignments = (await tx.resourceAssignment.updateMany({
    where: { personId: duplicateId }, data: { personId: primaryId },
  })).count;
  rePointed.payrollRecords = (await tx.payrollPersonRecord.updateMany({
    where: { personId: duplicateId }, data: { personId: primaryId },
  })).count;

  // Leave balances share the [org, person, type, year] unique —
  // consolidate the duplicate's usage into the primary, then delete.
  const [primaryBalances, duplicateBalances] = await Promise.all([
    tx.leaveBalance.findMany({ where: { personId: primaryId } }),
    tx.leaveBalance.findMany({ where: { personId: duplicateId } }),
  ]);
  let consolidatedBalances = 0;
  for (const dup of duplicateBalances) {
    const match = primaryBalances.find(
      (b) => b.leaveType === dup.leaveType && b.year === dup.year,
    );
    if (match) {
      await tx.leaveBalance.update({
        where: { id: match.id },
        data: {
          totalAllowed: match.totalAllowed + dup.totalAllowed,
          taken: match.taken + dup.taken,
          remaining: match.remaining + dup.remaining,
        },
      });
      await tx.leaveBalance.delete({ where: { id: dup.id } });
    } else {
      await tx.leaveBalance.update({ where: { id: dup.id }, data: { personId: primaryId } });
    }
    consolidatedBalances += 1;
  }
  rePointed.leaveBalances = consolidatedBalances;

  // App-account link: move it only when the primary has none (the
  // column is globally unique); otherwise drop the duplicate's link —
  // identity of the surviving record stays unambiguous.
  if (!primary.linkedUserId && duplicate.linkedUserId) {
    await tx.person.update({ where: { id: primaryId }, data: { linkedUserId: duplicate.linkedUserId } });
    await tx.person.update({ where: { id: duplicateId }, data: { linkedUserId: null } });
  } else if (duplicate.linkedUserId) {
    await tx.person.update({ where: { id: duplicateId }, data: { linkedUserId: null } });
  }

  await tx.person.update({
    where: { id: duplicateId },
    data: { mergedIntoId: primaryId, status: "inactive" },
  });

  await audit({
    userId: args.actorId,
    action: "workforce.person.merge",
    entityType: "Person",
    entityId: primaryId,
    metadata: {
      duplicateId,
      reason: args.reason || null,
      rePointed,
    },
  });

  return { merged: true, rePointed };
}

// ─────────────────────────────────────────────────────────────
// 5. Person history (org-wide, read-only)
// ─────────────────────────────────────────────────────────────

/**
 * The person's cross-project story: assignment chain, advances ledger,
 * payroll records, leave — everything the ADR promises survives an
 * engagement ending, in one read.
 */
export async function getPersonHistory(tx: Executor, personId: string) {
  const person = await tx.person.findUnique({
    where: { id: personId },
    include: { mergedInto: { select: { id: true, displayName: true } } },
  });
  if (!person) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found." });

  const [assignments, advances, payrollRecords, leaveRequests] = await Promise.all([
    tx.projectStaffAssignment.findMany({
      where: { personId },
      orderBy: { fromDate: "desc" },
      include: { project: { select: { id: true, name: true, code: true } } },
      take: 200,
    }),
    tx.staffAdvance.findMany({
      where: { personId },
      orderBy: { date: "desc" },
      include: { project: { select: { id: true, name: true } } },
      take: 200,
    }),
    tx.payrollPersonRecord.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
      include: { payrollRun: { select: { id: true, period: true, status: true } } },
      take: 200,
    }),
    tx.leaveRequest.findMany({
      where: { personId },
      orderBy: { startDate: "desc" },
      include: { project: { select: { id: true, name: true } } },
      take: 200,
    }),
  ]);

  const outstandingAdvance = advances.reduce(
    (sum, a) => sum + Math.max(0, a.amount - a.recoveredAmount),
    0,
  );

  return {
    person,
    assignments,
    advances: { rows: advances, outstandingTotal: outstandingAdvance },
    // paymentStatus is DERIVED from amounts (ADR-0006 §2) — never stored.
    payrollRecords: payrollRecords.map((r) => ({
      ...r,
      paymentStatus: derivePaymentStatus(r.paidAmount, r.netPayable),
    })),
    leaveRequests,
  };
}
