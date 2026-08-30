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
  | "accounting"
  | "guarantees";

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  core: boolean; // core modules are locked ON and cannot be disabled
  group: ModuleGroup;
}

export type ModuleGroup =
  | "Core"
  | "Contract Management"
  | "Procurement"
  | "Site Management"
  | "Compliance"
  | "Advanced";

export type ModulePreset = "record_keeper" | "lean" | "enterprise" | "simple" | "standard" | "full";

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  // ── 11 Essential Core Pillars (Permanently Locked ON for ALL Contractors) ──
  { key: "dashboard",       label: "Project Overview",         core: true,  group: "Core",                description: "Project health, metrics, costs & activity feed" },
  { key: "boq",             label: "BOQ & Rate Analysis",      core: true,  group: "Core",                description: "Bill of Quantities & rate analysis library" },
  { key: "accounting",      label: "Site Day Book & Cashbook", core: true,  group: "Core",                description: "Day Book (रोजकट्टी), Cash Inflow/Outflow & Vouchers" },
  { key: "payments",        label: "Site Payables & Bahi Khata", core: true, group: "Core",               description: "Party ledgers, vendor claims & outstanding credit balances" },
  { key: "materials",       label: "Materials & Stock Ledger", core: true,  group: "Procurement",         description: "Material catalog, direct buy, 1-click inter-site transfers & stock" },
  { key: "subcontractors",  label: "Subcontractors & Theka",   core: true,  group: "Site Management",     description: "Subcontractor management, muster roll attendance & gang piece-rates" },
  { key: "vat",             label: "VAT & Tax Summary",        core: true,  group: "Compliance",          description: "VAT bills, IRD Schedule 8/9/10 & TDS tax tracking" },
  { key: "guarantees",      label: "Bank Guarantees & Insurance", core: true, group: "Contract Management", description: "Performance Bonds, APG, CAR Insurance & Expiry alerts" },
  { key: "correspondence",  label: "Correspondence Register",  core: true,  group: "Contract Management", description: "Official letter logging, notice to commence & reply deadlines" },
  { key: "drawings",        label: "Drawings & Blueprints",    core: true,  group: "Site Management",     description: "Master drawing register & architectural/structural revisions" },
  { key: "documents",       label: "Documents Vault",          core: true,  group: "Core",                description: "Central document archive, transmittals & versioned project vault" },

  // ── Modular Workflows (Toggleable via Presets or Granular Switches) ──
  { key: "equipment",       label: "Equipment & Machinery",    core: false, group: "Site Management",     description: "Equipment fuel/hour logs, spot hire & maintenance" },
  { key: "dailyProgramme",  label: "Daily Programme (Lookahead)", core: false, group: "Site Management",  description: "Daily & 3-day look-ahead site execution planning" },
  { key: "punchList",       label: "Punch / Snag List",        core: false, group: "Site Management",     description: "Defect rectification & handover snag list" },
  { key: "gantt",           label: "Gantt CPM Scheduling",     core: false, group: "Site Management",     description: "CPM Critical Path, dependencies, float & S-Curves" },
  { key: "ipc",             label: "IPC Certificates",         core: false, group: "Contract Management", description: "Interim Payment Certificates (Nepal Don Bosco format)" },
  { key: "variations",      label: "Variation Orders",         core: false, group: "Contract Management", description: "Contract changes, extra items & rate variations" },
  { key: "rfi",             label: "RFI Management",           core: false, group: "Contract Management", description: "Requests for Information & formal employer queries" },
  { key: "submittals",      label: "Formal Submittals",        core: false, group: "Contract Management", description: "Material & shop drawing submittals to consultant" },
  { key: "purchaseOrders",  label: "Purchase Orders (PO)",     core: false, group: "Procurement",         description: "Formal PO issuance, approval gates & vendor matching" },
  { key: "requisitions",    label: "Purchase Requisitions",    core: false, group: "Procurement",         description: "Site purchase requisitions with 3-quote comparison" },
  { key: "qualitySafety",   label: "Quality & Safety (QA/QC)", core: false, group: "Site Management",     description: "Concrete cube crushing test register, safety & toolbox talks" },
  { key: "production",      label: "Plant & Production",       core: false, group: "Advanced",            description: "Concrete & asphalt batching plants, JMF & batch tickets" },
  { key: "hr",              label: "HR & Staff Payroll",       core: false, group: "Site Management",     description: "Company staff directory & payroll (Nepal CIT/SSF)" },
];

// ── Preset Templates ─────────────────────────────────────────────

/** Keys enabled in each preset. Core modules are always enabled. */
export const PRESET_ENABLED: Record<ModulePreset, ModuleKey[]> = {
  // 1. Pure Record-Keeper: 11 Core Pillars + Equipment Daily Logs (Zero planning/PO friction)
  record_keeper: [
    "dashboard", "boq", "accounting", "payments", "materials",
    "subcontractors", "vat", "guarantees", "correspondence", "drawings",
    "equipment",
  ],
  simple: [
    "dashboard", "boq", "accounting", "payments", "materials",
    "subcontractors", "vat", "guarantees", "correspondence", "drawings",
    "equipment",
  ],

  // 2. Lean Site Builder: Record-Keeper + Daily Programme Lookahead + Punch List
  lean: [
    "dashboard", "boq", "accounting", "payments", "materials",
    "subcontractors", "vat", "guarantees", "correspondence", "drawings",
    "equipment", "dailyProgramme", "punchList",
  ],
  standard: [
    "dashboard", "boq", "accounting", "payments", "materials",
    "subcontractors", "vat", "guarantees", "correspondence", "drawings",
    "equipment", "dailyProgramme", "punchList", "ipc", "variations",
  ],

  // 3. Full Enterprise & JV: All 24 modules with full CPM scheduling and corporate procurement
  enterprise: MODULE_DEFINITIONS.map((m) => m.key),
  full: MODULE_DEFINITIONS.map((m) => m.key),
};

export const PRESET_METADATA: Record<"record_keeper" | "lean" | "enterprise", { title: string; subtitle: string; icon: string }> = {
  record_keeper: {
    title: "Pure Record-Keeper",
    subtitle: "Actuals only: Day Book, Materials, Labor, Guarantees, Drawings & Reports. Zero planning friction.",
    icon: "📒",
  },
  lean: {
    title: "Lean Site Builder",
    subtitle: "Record-Keeper + Daily Lookahead Programme & Punch Lists for active site builders.",
    icon: "⚡",
  },
  enterprise: {
    title: "Full Enterprise & JV",
    subtitle: "Complete suite: CPM Gantt, 3-Way Match POs/Requisitions, Batching Plants & JV Governance.",
    icon: "🏛️",
  },
};

/**
 * Build enabledModules JSON for a given preset.
 * Only stores `false` for disabled modules; enabled modules are absent (default true).
 */
export function buildPresetModules(preset: ModulePreset): Record<string, boolean> {
  const enabled = new Set(PRESET_ENABLED[preset] ?? PRESET_ENABLED.record_keeper);
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
