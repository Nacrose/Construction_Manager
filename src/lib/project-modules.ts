/**
 * Project Module Toggle System
 *
 * Defines every toggleable module in Construction Manager.
 * Modules are stored as a JSON object in Project.enabledModules.
 * A missing key means enabled (backward-compatible default).
 * A key set to false means the module is hidden from the UI.
 */

export type ModuleKey =
  | "dashboard"
  | "boq"
  | "gantt"
  | "payments"
  | "materials"
  | "subcontractors"
  | "ipc"
  | "variations"
  | "hr"
  | "equipment"
  | "vat"
  | "purchaseOrders"
  | "requisitions"
  | "rfi"
  | "dailyProgramme"
  | "submittals"
  | "correspondence"
  | "punchList"
  | "qualitySafety"
  | "production"
  | "drawings"
  | "documents"
  | "accounting";

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  core: boolean; // core modules cannot be disabled
  group: ModuleGroup;
}

export type ModuleGroup =
  | "Core"
  | "Contract Management"
  | "Procurement"
  | "Site Management"
  | "Compliance"
  | "Advanced";

export type ModulePreset = "simple" | "standard" | "full";

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  // ── Core (cannot be disabled) ─────────────────────────────────
  { key: "dashboard",       label: "Dashboard",                core: true,  group: "Core",                description: "Project overview, costs & activity feed" },
  { key: "boq",             label: "BOQ & Rate Analysis",      core: true,  group: "Core",                description: "Bill of Quantities & rate analysis library" },
  { key: "payments",        label: "Payments",                 core: true,  group: "Core",                description: "Payment ledger, categories & outstanding balances" },

  // ── Contract Management ───────────────────────────────────────
  { key: "ipc",             label: "IPC Certificates",         core: false, group: "Contract Management", description: "Interim Payment Certificates (Nepal Don Bosco format)" },
  { key: "variations",      label: "Variation Orders",         core: false, group: "Contract Management", description: "Contract changes & extras" },
  { key: "rfi",             label: "RFI",                      core: false, group: "Contract Management", description: "Requests for Information & formal responses" },
  { key: "submittals",      label: "Formal Submittals",        core: false, group: "Contract Management", description: "Material & shop drawing submittals" },
  { key: "correspondence",  label: "Correspondence",           core: false, group: "Contract Management", description: "Letter tracking & reply deadlines" },

  // ── Procurement ───────────────────────────────────────────────
  { key: "materials",       label: "Materials & Inventory",    core: false, group: "Procurement",         description: "Material catalog, GRN, stock & store locations" },
  { key: "purchaseOrders",  label: "Purchase Orders",          core: false, group: "Procurement",         description: "PO issuance, tracking & vendor bills" },
  { key: "requisitions",    label: "Requisition Forms",        core: false, group: "Procurement",         description: "Purchase requisitions with 3-quote comparison" },

  // ── Site Management ───────────────────────────────────────────
  { key: "gantt",           label: "Gantt / Programme",        core: false, group: "Site Management",     description: "Gantt chart, dependencies & schedule versions" },
  { key: "subcontractors",  label: "Subcontractors",           core: false, group: "Site Management",     description: "Subcontractor management, billing & retention" },
  { key: "hr",              label: "HR & Payroll",             core: false, group: "Site Management",     description: "Staff, muster roll, leave & salary (Nepal CIT/SSF)" },
  { key: "equipment",       label: "Equipment",                core: false, group: "Site Management",     description: "Equipment logs, maintenance & spot hire" },
  { key: "dailyProgramme",  label: "Daily Programme",          core: false, group: "Site Management",     description: "Daily look-ahead planning & execution tracking" },
  { key: "punchList",       label: "Punch List",               core: false, group: "Site Management",     description: "Snagging & defect tracking" },
  { key: "qualitySafety",   label: "Quality & Safety",         core: false, group: "Site Management",     description: "Quality inspections, safety incidents & toolbox talks" },
  { key: "drawings",        label: "Drawings",                 core: false, group: "Site Management",     description: "Drawing register & revision management" },
  { key: "documents",       label: "Document Center",          core: false, group: "Site Management",     description: "Project documents, approvals & transmittals" },

  // ── Compliance ────────────────────────────────────────────────
  { key: "vat",             label: "VAT & Tax Summary",        core: false, group: "Compliance",          description: "VAT bills, IRD Schedule 8/9/10 & TDS tracking" },

  // ── Advanced ──────────────────────────────────────────────────
  { key: "production",      label: "Plant & Production",       core: false, group: "Advanced",            description: "Concrete & asphalt batching, mix JMF & batch tickets" },
  { key: "accounting",      label: "Accounting Module",        core: false, group: "Advanced",            description: "Day Book, Party Ledger, Trial Balance & P&L (coming soon)" },
];

// ── Preset Templates ─────────────────────────────────────────────

/** Keys enabled in each preset. Core modules are always enabled. */
const PRESET_ENABLED: Record<ModulePreset, ModuleKey[]> = {
  simple: [
    "dashboard", "boq", "payments",
    "materials", "gantt", "hr",
  ],
  standard: [
    "dashboard", "boq", "payments",
    "materials", "gantt", "hr",
    "subcontractors", "ipc", "variations", "vat", "equipment",
  ],
  full: MODULE_DEFINITIONS.map((m) => m.key),
};

/**
 * Build enabledModules JSON for a given preset.
 * Only stores `false` for disabled modules; enabled modules are absent (default true).
 */
export function buildPresetModules(preset: ModulePreset): Record<string, boolean> {
  const enabled = new Set(PRESET_ENABLED[preset]);
  const result: Record<string, boolean> = {};
  for (const mod of MODULE_DEFINITIONS) {
    if (!mod.core && !enabled.has(mod.key)) {
      result[mod.key] = false;
    }
  }
  return result;
}

/**
 * Returns true if a given module is enabled for a project.
 * Core modules are always enabled regardless of settings.
 * A missing key defaults to enabled (backward compatible).
 */
export function isModuleEnabled(
  enabledModules: Record<string, boolean> | null | undefined,
  key: ModuleKey
): boolean {
  const def = MODULE_DEFINITIONS.find((m) => m.key === key);
  if (def?.core) return true; // core modules always on
  if (!enabledModules) return true; // no settings = all enabled
  const val = enabledModules[key];
  return val !== false; // undefined or true = enabled
}

/**
 * Parse the raw JSON from prisma (which may be string or object).
 */
export function parseEnabledModules(
  raw: unknown
): Record<string, boolean> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof raw === "object") return raw as Record<string, boolean>;
  return {};
}

/**
 * Group module definitions by their group label.
 */
export function groupModules(): Map<ModuleGroup, ModuleDefinition[]> {
  const map = new Map<ModuleGroup, ModuleDefinition[]>();
  for (const mod of MODULE_DEFINITIONS) {
    const arr = map.get(mod.group) ?? [];
    arr.push(mod);
    map.set(mod.group, arr);
  }
  return map;
}
