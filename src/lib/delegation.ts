/**
 * Delegation Engine — enforces per-org financial authority rules.
 * Based on the organization's operatingModel.
 */
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import type { AuthUser } from "@/lib/auth";

export type OperatingModel =
  | "hq_centralized_imprest"
  | "hybrid_daybook_hq_procure"
  | "decentralized_site_and_hq"
  | "single_project_jv";

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
  | "log_direct_material_purchase";

const HQ_ONLY_ACTIONS: DelegationAction[] = [
  "create_payment", "bulk_create_payments", "create_vendor_bill",
  "record_vendor_payment", "create_subcontractor_bill", "mark_subcontractor_paid",
  "create_purchase_order", "settle_multi_bill", "create_bank_account",
  "create_head_office_expense", "release_retention", "record_jv_payout",
];

export const DEFAULT_DELEGATION_RULES: Record<OperatingModel, Array<{
  action: string; maxAmount: number | null; allowedRoles: string[]; siteScopedOnly: boolean;
}>> = {
  hq_centralized_imprest: [
    { action: "create_site_expense", maxAmount: 25000, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: true },
    { action: "approve_site_expense", maxAmount: 25000, allowedRoles: ["coordinator", "project_manager"], siteScopedOnly: false },
    { action: "create_payment", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "bulk_create_payments", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_vendor_bill", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "record_vendor_payment", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_subcontractor_bill", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "mark_subcontractor_paid", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_purchase_order", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "settle_multi_bill", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_bank_account", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_head_office_expense", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "release_retention", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "record_jv_payout", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "log_direct_material_purchase", maxAmount: 25000, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: true },
  ],
  hybrid_daybook_hq_procure: [
    { action: "create_payment", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "bulk_create_payments", maxAmount: null, allowedRoles: ["coordinator", "project_manager"], siteScopedOnly: false },
    { action: "create_site_expense", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "approve_site_expense", maxAmount: null, allowedRoles: ["coordinator", "project_manager"], siteScopedOnly: false },
    { action: "create_vendor_bill", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "record_vendor_payment", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_subcontractor_bill", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "mark_subcontractor_paid", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_purchase_order", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "settle_multi_bill", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_bank_account", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_head_office_expense", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "release_retention", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "record_jv_payout", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "log_direct_material_purchase", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
  ],
  decentralized_site_and_hq: [
    { action: "create_payment", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "bulk_create_payments", maxAmount: null, allowedRoles: ["coordinator", "project_manager"], siteScopedOnly: false },
    { action: "create_site_expense", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "approve_site_expense", maxAmount: null, allowedRoles: ["coordinator", "project_manager"], siteScopedOnly: false },
    { action: "create_vendor_bill", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "record_vendor_payment", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_subcontractor_bill", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "mark_subcontractor_paid", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_purchase_order", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "settle_multi_bill", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_bank_account", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_head_office_expense", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "release_retention", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "record_jv_payout", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "log_direct_material_purchase", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
  ],
  single_project_jv: [
    { action: "create_payment", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "bulk_create_payments", maxAmount: null, allowedRoles: ["coordinator", "project_manager"], siteScopedOnly: false },
    { action: "create_site_expense", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "approve_site_expense", maxAmount: null, allowedRoles: ["coordinator", "project_manager"], siteScopedOnly: false },
    { action: "create_vendor_bill", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "record_vendor_payment", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_subcontractor_bill", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "mark_subcontractor_paid", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_purchase_order", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
    { action: "settle_multi_bill", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_bank_account", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "create_head_office_expense", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "release_retention", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "record_jv_payout", maxAmount: null, allowedRoles: ["project_manager", "coordinator"], siteScopedOnly: false },
    { action: "log_direct_material_purchase", maxAmount: null, allowedRoles: ["engineer", "coordinator", "project_manager"], siteScopedOnly: false },
  ],
};

export async function getOrgConfig(orgId: string | null | undefined) {
  if (!orgId) return null;
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { operatingModel: true, sitePettyCashLimit: true },
  });
  if (!org) {
    return {
      operatingModel: "hybrid_project_autonomous" as OperatingModel,
      sitePettyCashLimit: 50000,
      rules: new Map<string, { maxAmount: number | null; allowedRoles: string[]; siteScopedOnly: boolean }>(),
    };
  }

  const rules = await db.delegationRule.findMany({
    where: { organizationId: orgId },
  });
  const ruleMap = new Map<string, { maxAmount: number | null; allowedRoles: string[]; siteScopedOnly: boolean }>();
  for (const r of rules) {
    ruleMap.set(r.action, {
      maxAmount: r.maxAmount,
      allowedRoles: JSON.parse(r.allowedRoles || "[]"),
      siteScopedOnly: r.siteScopedOnly,
    });
  }
  return {
    operatingModel: (org.operatingModel || "hybrid_project_autonomous") as OperatingModel,
    sitePettyCashLimit: org.sitePettyCashLimit ?? 50000,
    rules: ruleMap,
  };
}

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

  const config = await getOrgConfig(user.organizationId);
  if (!config) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Organization delegation configuration not found.",
    });
  }

  const rule = config.rules.get(action);

  if (rule) {
    if (rule.allowedRoles.length > 0) {
      const userOrgRole = user.orgRole || "";
      const userProjectRole = user.role || "";
      const hasRole =
        rule.allowedRoles.includes(userOrgRole) ||
        rule.allowedRoles.includes(userProjectRole) ||
        userOrgRole === "org_admin" ||
        userOrgRole === "owner";
      if (!hasRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your role is not authorized for "${action}" under the current operating model (${config.operatingModel}). Required: ${rule.allowedRoles.join(", ")}.`,
        });
      }
    }
    if (rule.maxAmount !== null && amount !== undefined && amount > rule.maxAmount) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Amount NPR ${amount.toLocaleString()} exceeds the delegation limit of NPR ${rule.maxAmount.toLocaleString()} for "${action}". Please request HQ approval.`,
      });
    }
  } else {
    // No explicit rule — apply model-based defaults
    if (config.operatingModel === "hq_centralized_imprest") {
      if (HQ_ONLY_ACTIONS.includes(action)) {
        const userOrgRole = user.orgRole || "";
        const isHqRole = userOrgRole === "org_admin" || userOrgRole === "owner" ||
          userOrgRole === "project_manager" || userOrgRole === "coordinator";
        if (!isHqRole) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Action "${action}" requires HQ authorization under the centralized operating model. Please contact your Project Manager at Head Office.`,
          });
        }
      }
      if (action === "create_site_expense" && amount !== undefined && amount > config.sitePettyCashLimit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Site expense of NPR ${amount.toLocaleString()} exceeds the petty cash limit of NPR ${config.sitePettyCashLimit.toLocaleString()}. Please request HQ to process this payment.`,
        });
      }
    } else if (config.operatingModel === "hybrid_daybook_hq_procure") {
      const hqOnlyInHybrid: DelegationAction[] = [
        "create_vendor_bill", "create_purchase_order", "settle_multi_bill",
        "create_bank_account", "create_head_office_expense",
      ];
      if (hqOnlyInHybrid.includes(action)) {
        const userOrgRole = user.orgRole || "";
        const isHqRole = userOrgRole === "org_admin" || userOrgRole === "owner" ||
          userOrgRole === "project_manager" || userOrgRole === "coordinator";
        if (!isHqRole) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Action "${action}" is reserved for HQ under the hybrid operating model.`,
          });
        }
      }
    }
    // "decentralized_site_and_hq" — no additional restrictions
  }
}

export async function seedDelegationRules(orgId: string, model: OperatingModel): Promise<void> {
  const defaults = DEFAULT_DELEGATION_RULES[model];
  if (!defaults) return;
  await db.delegationRule.deleteMany({ where: { organizationId: orgId } });
  await db.delegationRule.createMany({
    data: defaults.map(d => ({
      organizationId: orgId,
      action: d.action,
      maxAmount: d.maxAmount,
      allowedRoles: JSON.stringify(d.allowedRoles),
      siteScopedOnly: d.siteScopedOnly,
    })),
  });
}
