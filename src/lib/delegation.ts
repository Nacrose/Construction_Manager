/**
 * Delegation Engine — enforces per-org financial SPENDING LIMITS.
 *
 * Post Phase C (ADR-0004) this module owns exactly ONE of the three
 * authority axes: delegation `maxAmount` gates *how much*. The other two
 * live elsewhere and must never be re-merged here:
 *   - Capabilities gate *what the org can do*  → src/lib/capabilities.ts
 *   - Roles gate *who*                          → src/lib/authz.ts + proc.* tiers
 *
 * The legacy four-value workflow vocabulary (seeded role lists,
 * model-derived HQ-only branches) was removed with its Organization column
 * and DelegationRule.allowedRoles in the policy phase. Rules are now
 * org-admin-configured spending limits; the
 * one org-profile control that survives is the imprest petty-cash limit,
 * keyed on `financeLocation` (a setup-wizard field, not the deprecated
 * operating model).
 */
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import type { AuthUser } from "@/lib/auth";

export type DelegationAction =
  | "create_payment"
  | "bulk_create_payments"
  | "create_vendor_bill"
  | "record_vendor_payment"
  | "create_subcontractor_bill"
  | "mark_subcontractor_paid"
  | "create_purchase_order"
  | "create_site_expense"
  | "approve_site_expense"
  | "settle_multi_bill"
  | "create_bank_account"
  | "create_head_office_expense"
  | "release_retention"
  | "record_jv_payout"
  | "log_direct_material_purchase"
  // H-16: payroll moves money like any other path — it previously had NO
  // DelegationAction at all, so org maxAmount rules never applied.
  | "create_payroll_run"
  | "disburse_payroll";

/**
 * Throws when the action's amount exceeds the org's configured delegation
 * limit for that action, or the imprest petty-cash limit for site expenses.
 * Role/authority checks belong to the caller's procedure chain — this guard
 * is amount-only.
 */
export async function assertDelegation(
  user: AuthUser,
  action: DelegationAction,
  amount?: number,
): Promise<void> {
  if (user.isSuperAdmin) return;
  if (!user.organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User must belong to an organization to perform financial actions.",
    });
  }

  const [org, rules] = await Promise.all([
    db.organization.findUnique({
      where: { id: user.organizationId },
      select: { financeLocation: true, sitePettyCashLimit: true },
    }),
    db.delegationRule.findMany({
      where: { organizationId: user.organizationId },
      select: { action: true, maxAmount: true },
    }),
  ]);
  if (!org) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Organization delegation configuration not found.",
    });
  }

  // Imprest petty-cash ceiling: under an imprest-only finance location a
  // single site expense above the org's petty-cash limit needs HQ — the
  // amount axis of the same control the schema column documents.
  if (
    action === "create_site_expense" &&
    org.financeLocation === "imprest_only" &&
    org.sitePettyCashLimit != null &&
    amount !== undefined &&
    amount > org.sitePettyCashLimit
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Site expense of NPR ${amount.toLocaleString()} exceeds the petty cash limit of NPR ${Number(org.sitePettyCashLimit).toLocaleString()}. Please request HQ to process this payment.`,
    });
  }

  const rule = rules.find((r) => r.action === action);
  if (rule?.maxAmount != null && amount !== undefined && amount > Number(rule.maxAmount)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Amount NPR ${amount.toLocaleString()} exceeds the delegation limit of NPR ${Number(rule.maxAmount).toLocaleString()} for "${action}". Please request HQ approval.`,
    });
  }
}
