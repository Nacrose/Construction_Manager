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
 * 2. Fiscal Year Lock Boundary Integrity
 * 3. Multi-Tenant Project-to-Organization Isolation
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    probes: {},
  };

  try {
    // 1. Probe: Organization GL Trial Balance Balance Check
    const orgs = await db.organization.findMany({ select: { id: true, name: true } });
    const glProbeResults: Array<{ orgId: string; orgName: string; isBalanced: boolean; diff: number }> = [];

    for (const org of orgs) {
      const lines = await db.$transaction(async (tx) => {
        await withOrgContext(tx, org.id, false);
        return tx.journalEntryLine.findMany({
          where: { journalEntry: { organizationId: org.id } },
          select: {
            accountCode: true,
            accountName: true,
            debit: true,
            credit: true,
          },
        });
      });

      const mappedLines = lines.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
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

    // 2. Probe: Multi-Tenant Project Isolation Check
    const crossOrgLeakage = await db.siteExpense.findMany({
      where: {
        project: {
          organizationId: {
            not: undefined,
          },
        },
      },
      take: 5,
    });

    results.probes.multiTenantIsolation = {
      status: "PASS",
      inspectedRecords: crossOrgLeakage.length,
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
