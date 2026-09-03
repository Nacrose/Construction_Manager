/**
 * Operating Method & Capability Model (ADR-0004) — the pure, shared SSOT.
 *
 * Three axes, three different types — NEVER merged again (ADR-0004 §2):
 *   - Capabilities  gate *what the org can do*      (this module)
 *   - Roles         gate *who*                      (src/lib/authz.ts)
 *   - Delegation    `maxAmount` gates *how much*    (src/lib/delegation.ts)
 *
 * The operating method supplies DEFAULTS; the resolved capability map is
 * what routers and (later, ADR-0006) the engine check. Disabling a
 * capability is prospective only: new/unposted work binds to the ACTIVE
 * OrganizationPolicyVersion, posted history is never reinterpreted
 * (ADR-0004 §3) — enforcement reads the active version through
 * src/lib/policy-version.ts, never client input.
 *
 * This module is deliberately pure (no db, no server imports) so the UI
 * can derive navigation from the same vocabulary — a projection, never
 * the guard (ADR-0004 consequences).
 */

import { z } from "zod";

// ─── Vocabulary ────────────────────────────────────────────────

/**
 * Workflow template, NOT a contractor-size class (ADR-0004 §1). Exactly
 * three values; it must never be inferred from project count, user count,
 * staff count, or pricing tier — the product has no commercial packaging
 * axis at all.
 */
export type OperatingMethod = "owner_led" | "crew_led" | "delegated";

export const OPERATING_METHODS: readonly OperatingMethod[] = [
  "owner_led",
  "crew_led",
  "delegated",
] as const;

export const operatingMethodSchema = z.enum(["owner_led", "crew_led", "delegated"]);

export type ProcurementChain = "none" | "quotes" | "full";
export type InventoryControl = "none" | "basic" | "controlled";
export type FinanceReview = "owner_recorded" | "delegated_review";

export type OperatingCapabilities = {
  /**
   * Procurement workflow depth. "none" = requisitions, quote comparisons
   * and purchase orders DO NOT EXIST server-side for the org (they are
   * absent from the capability map, not hidden in the UI — ADR-0004 §4).
   * "quotes" adds quote comparison without PO issuance; "full" adds the
   * complete requisition → approval → PO chain.
   */
  procurementChain: ProcurementChain;
  /** Stores depth. "none" = no store locations / stock control exists. */
  inventoryControl: InventoryControl;
  /** Site gate register (entries/exits of materials & plant). */
  gateRegister: boolean;
  /** Who reviews finance: the owner records everything themselves, or a delegated reviewer approves. */
  financeReview: FinanceReview;
  /** Direct (off-chain) material purchases are first-class (ADR product principles). */
  directPurchase: boolean;
  /** Direct site expenses are first-class. */
  directExpense: boolean;
  /** Workforce planning & payroll (org-level runs, ADR-0007). */
  workforcePlanning: boolean;
};

export const capabilitiesSchema = z.object({
  procurementChain: z.enum(["none", "quotes", "full"]),
  inventoryControl: z.enum(["none", "basic", "controlled"]),
  gateRegister: z.boolean(),
  financeReview: z.enum(["owner_recorded", "delegated_review"]),
  directPurchase: z.boolean(),
  directExpense: z.boolean(),
  workforcePlanning: z.boolean(),
});

/** Partial overrides applied on top of method defaults at activation time. */
export const capabilityOverridesSchema = z.object({
  procurementChain: z.enum(["none", "quotes", "full"]).optional(),
  inventoryControl: z.enum(["none", "basic", "controlled"]).optional(),
  gateRegister: z.boolean().optional(),
  financeReview: z.enum(["owner_recorded", "delegated_review"]).optional(),
  directPurchase: z.boolean().optional(),
  directExpense: z.boolean().optional(),
  workforcePlanning: z.boolean().optional(),
});

export type CapabilityOverrides = z.infer<typeof capabilityOverridesSchema>;

// ─── Method defaults (ADR-0004 §4 + §2) ───────────────────────

/**
 * owner_led defaults are LITERALLY SPECIFIED by ADR-0004 §4: procurement
 * none, inventory none, gate register off, owner-recorded finance review,
 * direct purchase on, direct expense on, workforce planning on. No
 * requisitions, POs, quotes, stores, gate register, or approval chain
 * exist server-side.
 */
export const METHOD_CAPABILITY_DEFAULTS: Record<OperatingMethod, OperatingCapabilities> = {
  owner_led: {
    procurementChain: "none",
    inventoryControl: "none",
    gateRegister: false,
    financeReview: "owner_recorded",
    directPurchase: true,
    directExpense: true,
    workforcePlanning: true,
  },
  /**
   * crew_led: owner works with site crews — simple quote records and
   * basic stock tracking appear, but PO issuance, gate register and
   * delegated finance review do not.
   */
  crew_led: {
    procurementChain: "quotes",
    inventoryControl: "basic",
    gateRegister: false,
    financeReview: "owner_recorded",
    directPurchase: true,
    directExpense: true,
    workforcePlanning: true,
  },
  /**
   * delegated: structured organisation — full procurement chain,
   * controlled stores, gate register, delegated finance review.
   */
  delegated: {
    procurementChain: "full",
    inventoryControl: "controlled",
    gateRegister: true,
    financeReview: "delegated_review",
    directPurchase: true,
    directExpense: true,
    workforcePlanning: true,
  },
};

/** Resolves a method to its default capability map. Fails loud on unknown values. */
export function methodDefaults(method: string): OperatingCapabilities {
  const defaults = (METHOD_CAPABILITY_DEFAULTS as Record<string, OperatingCapabilities | undefined>)[method];
  if (!defaults) {
    throw new Error(
      `[policy] Unknown operating method "${method}". Expected one of: ${OPERATING_METHODS.join(", ")}.`
    );
  }
  return defaults;
}

/**
 * Validates an untrusted capability map (e.g. the JSON column on
 * OrganizationPolicyVersion). Never trust client input (schema.prisma
 * contract) — this is the only sanctioned parse path.
 */
export function parseCapabilities(raw: unknown): OperatingCapabilities {
  const result = capabilitiesSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `[policy] Invalid capabilities payload: ${result.error.issues
        .map((i) => `${i.path.join(".") || "<root>"} ${i.message}`)
        .join("; ")}`
    );
  }
  return result.data;
}

/** Merges validated overrides on top of a method's defaults. */
export function resolveCapabilityMap(
  method: OperatingMethod,
  overrides?: CapabilityOverrides
): OperatingCapabilities {
  return { ...methodDefaults(method), ...(overrides ?? {}) };
}

// ─── Requirement checks (pure; middleware turns shortfalls into errors) ──

/**
 * What a controlled mutation requires, expressed per axis. Enum axes use
 * "at least" semantics on the escalation ladder
 * (none < quotes < full; none < basic < controlled); boolean axes require
 * exactly true.
 */
export type CapabilityRequirement = Partial<{
  procurementChain: "quotes" | "full";
  inventoryControl: "basic" | "controlled";
  gateRegister: true;
  financeReview: "delegated_review";
  directPurchase: true;
  directExpense: true;
  workforcePlanning: true;
}>;

const PROCUREMENT_LADDER: ProcurementChain[] = ["none", "quotes", "full"];
const INVENTORY_LADDER: InventoryControl[] = ["none", "basic", "controlled"];

function atLeast<T>(ladder: T[], current: T, required: T): boolean {
  return ladder.indexOf(current) >= ladder.indexOf(required);
}

export type CapabilityShortfall = {
  capability: keyof OperatingCapabilities;
  current: string;
  required: string;
  message: string;
};

/**
 * Pure requirement check. Returns the FIRST unmet capability (deterministic
 * field order) or null when every requirement is satisfied.
 */
export function describeCapabilityShortfall(
  capabilities: OperatingCapabilities,
  requirements: CapabilityRequirement
): CapabilityShortfall | null {
  const entries: Array<[keyof OperatingCapabilities, boolean, string, string]> = [];

  if (requirements.procurementChain) {
    entries.push([
      "procurementChain",
      atLeast(PROCUREMENT_LADDER, capabilities.procurementChain, requirements.procurementChain),
      capabilities.procurementChain,
      requirements.procurementChain,
    ]);
  }
  if (requirements.inventoryControl) {
    entries.push([
      "inventoryControl",
      atLeast(INVENTORY_LADDER, capabilities.inventoryControl, requirements.inventoryControl),
      capabilities.inventoryControl,
      requirements.inventoryControl,
    ]);
  }
  if (requirements.gateRegister) {
    entries.push(["gateRegister", capabilities.gateRegister, String(capabilities.gateRegister), "true"]);
  }
  if (requirements.financeReview) {
    entries.push([
      "financeReview",
      capabilities.financeReview === requirements.financeReview,
      capabilities.financeReview,
      requirements.financeReview,
    ]);
  }
  for (const key of ["directPurchase", "directExpense", "workforcePlanning"] as const) {
    if (requirements[key]) {
      entries.push([key, capabilities[key] === true, String(capabilities[key]), "true"]);
    }
  }

  for (const [capability, met, current, required] of entries) {
    if (!met) {
      return {
        capability,
        current,
        required,
        message: `[policy] Capability "${capability}" is not enabled for this organisation (current: ${current}, required: ${required}).`,
      };
    }
  }
  return null;
}
