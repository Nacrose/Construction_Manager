import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgContext } from "@/lib/rls";
import { aggregateTrialBalance } from "@/server/utils/gl-trial-balance";
import { emitDomainEvent } from "@/server/utils/domain-events";

export const dynamic = "force-dynamic";

/**
 * Self-Watching Invariant Cron Endpoint
 *
 * Runs scheduled validation probes:
 * 1. GL Double-Entry Trial Balance Equality per Organization
 *    (SQL-side aggregation — one row per account, not one per line)
 * 2. Multi-Tenant Project Isolation: under a pinned org A context, a
 *    deliberately cross-org query for org B's projects MUST return 0
 *    rows. If RLS is disabled/dropped (e.g. a raw `db push`), this probe
 *    catches it instead of silently reporting PASS.
 *
 * SECURITY: this endpoint is only reachable with the CRON_SECRET bearer
 * token (Vercel Cron attaches it automatically when the env var exists).
 * Previously an unset CRON_SECRET made the endpoint fully public — and
 * each invocation scans every org's ledger, i.e. an unauthenticated
 * cost/DoS handle. It now fails CLOSED: no secret configured, no run.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed — never run invariant probes for unauthenticated callers.
  if (!cronSecret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not configured. Invariant probes are disabled (fail-closed). Set CRON_SECRET so Vercel Cron can authenticate.",
      },
      { status: 503 },
    );
  }

  // Constant-time-ish comparison is unnecessary for a random high-entropy
  // secret; direct comparison matches the platform's own cron behavior.
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    probes: {},
  };

  try {
    // 1. Probe: Organization GL Trial Balance Balance Check.
    // Aggregated per account in SQL (groupBy + _sum) instead of loading
    // every journal-entry line into memory — same trial-balance math,
    // O(distinct accounts) rows transferred instead of O(all lines).
    const orgs = await db.organization.findMany({ select: { id: true, name: true } });
    const glProbeResults: Array<{ orgId: string; orgName: string; isBalanced: boolean; diff: number }> = [];

    for (const org of orgs) {
      const grouped = await db.$transaction(async (tx) => {
        await withOrgContext(tx, org.id, false);
        return tx.journalEntryLine.groupBy({
          by: ["accountCode", "accountName"],
          where: { journalEntry: { organizationId: org.id } },
          _sum: { debit: true, credit: true },
        });
      });

      const mappedLines = grouped.map((g) => ({
        accountCode: g.accountCode,
        accountName: g.accountName,
        debit: Number(g._sum.debit) || 0,
        credit: Number(g._sum.credit) || 0,
      }));

      const tb = aggregateTrialBalance(mappedLines);
      glProbeResults.push({
        orgId: org.id,
        orgName: org.name,
        isBalanced: tb.isBalanced,
        diff: tb.difference,
      });

      if (!tb.isBalanced) {
        emitDomainEvent({
          type: "gl.imbalance.detected",
          actorUserId: "system-cron",
          title: `GL Imbalance Detected: ${org.name}`,
          message: `Trial balance has a discrepancy of NPR ${tb.difference.toFixed(2)} (Debits: ${tb.totalDebits}, Credits: ${tb.totalCredits}).`,
          entityType: "organization",
          entityId: org.id,
          metadata: {
            orgId: org.id,
            difference: tb.difference,
            totalDebits: tb.totalDebits,
            totalCredits: tb.totalCredits,
          },
        });
      }

    }

    results.probes.glTrialBalance = {
      status: glProbeResults.every((r) => r.isBalanced) ? "PASS" : "FAIL",
      details: glProbeResults,
    };

    // 2. Probe: Multi-Tenant Project Isolation (REAL probe).
    // Pick up to two orgs that own projects. Under a transaction-scoped
    // org-A context, deliberately query for org B's projects — the WHERE
    // clause *asks* for the other tenant's rows, so only the database's
    // RLS policy can stop them. `Project` has FORCE ROW LEVEL SECURITY,
    // so a healthy database returns 0; anything else is a live leak.
    const isolationResults: Array<{
      contextOrgId: string;
      targetOrgId: string;
      leakedProjects: number;
    }> = [];

    const orgsWithProjects = await db.organization.findMany({
      where: { projects: { some: {} } },
      select: { id: true, name: true },
      take: 2,
      orderBy: { createdAt: "asc" },
    });

    let isolationStatus: "PASS" | "FAIL" | "SKIP" = "SKIP";

    if (orgsWithProjects.length >= 2) {
      const [orgA, orgB] = orgsWithProjects;
      for (const [contextOrg, targetOrg] of [
        [orgA, orgB],
        [orgB, orgA],
      ] as const) {
        const leakedProjects = await db.$transaction(async (tx) => {
          await withOrgContext(tx, contextOrg.id, false);
          return tx.project.count({ where: { organizationId: targetOrg.id } });
        });
        isolationResults.push({
          contextOrgId: contextOrg.id,
          targetOrgId: targetOrg.id,
          leakedProjects,
        });
        if (leakedProjects > 0) {
          emitDomainEvent({
            type: "tenant.isolation.violation",
            actorUserId: "system-cron",
            title: `Tenant Isolation Violation: ${contextOrg.name} can read ${targetOrg.name}`,
            message: `RLS probe found ${leakedProjects} project(s) from org ${targetOrg.id} visible under org ${contextOrg.id} context. Row-Level Security on "Project" is not being enforced — investigate immediately.`,
            entityType: "organization",
            entityId: contextOrg.id,
            metadata: {
              contextOrgId: contextOrg.id,
              targetOrgId: targetOrg.id,
              leakedProjects,
            },
          });
        }
      }
      isolationStatus = isolationResults.every((r) => r.leakedProjects === 0)
        ? "PASS"
        : "FAIL";
    }

    results.probes.multiTenantIsolation = {
      status: isolationStatus,
      details: isolationResults,
      note:
        isolationStatus === "SKIP"
          ? "Needs at least two orgs owning projects — probe skipped, not passed."
          : "Cross-org project reads under a pinned single-org context must return 0 rows (RLS enforced).",
    };

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (err: any) {
    console.error("[cron/invariants] Invariant probe execution failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Internal server error during invariant probe execution.",
      },
      { status: 500 }
    );
  }
}
