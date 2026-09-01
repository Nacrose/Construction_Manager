/**
 * NAV REGISTRY — single source of truth for application navigation.
 *
 * Engine Protocol: "If it is a rule, it is in the engine. If it is data, it is
 * in the registry." Before this file existed, the project's navigation shape
 * was declared in ~29 places: AppSidebar's inline arrays, 27 page-level
 * `*_TABS` constants (some drifted into divergent copies), and ModuleTabs'
 * AUTO_MODULE_MAP. Adding or renaming a route meant hunting every copy.
 *
 * Now every tab bar, the sidebar, and module gating derive from the clusters
 * below. To add a page to a tab bar: add one entry here. To add a route to
 * the sidebar: add one entry here. Nothing else.
 *
 * Conventions:
 *  - Tab `href` is relative to `/projects/[id]` (e.g. "/materials").
 *  - `absolute: true` means href already carries its base (used only by the
 *    workflow shell, whose own children live under /workflow/*).
 *  - `moduleKey` gates visibility by the project module-toggle system
 *    (src/lib/project-modules.ts). Only declare it where the legacy
 *    AUTO_MODULE_MAP declared one — core modules are locked ON anyway.
 */

import type { ComponentType } from "react";
import {
  HardHat, LayoutDashboard, FolderKanban, ClipboardList, ReceiptText,
  Users, Compass, FileSignature, ListChecks, Database, Mail, BookOpen, Boxes,
} from "lucide-react";
import type { ModuleKey } from "@/lib/project-modules";

// ── Types ────────────────────────────────────────────────────────

export type NavIcon = ComponentType<{ className?: string }>;

export type NavTab = {
  label: string;
  /** Path relative to /projects/[id], unless absolute: true. */
  href: string;
  /** Project module-toggle key; visibility filtered via isModuleEnabled. */
  moduleKey?: ModuleKey;
  /** href already contains its full base (workflow shell only). */
  absolute?: boolean;
};

export type SidebarNavItem = {
  label: string;
  /** Global nav: absolute app path. Project modules: relative to /projects/[id]. */
  href: string;
  icon: NavIcon;
};

// ── Tab Clusters ─────────────────────────────────────────────────
// Canonical tab bars, extracted verbatim from the pages that declared them.
// Where copies had drifted, the superset/oldest variant was kept canonical:
//   documents: drawings' 4-tab variant wins (document-center & submittals
//     gain "Photo Progress" — additive, low risk).
//   finance: the 6-tab variant (ipc/cash-flow/budget-variance) and the
//     compact 3-tab variant (accounting/payments/tax-summary) are BOTH real
//     product surfaces today; preserved as `finance` and `finance-compact`
//     until product decides to unify.

export type ClusterKey =
  | "resources"
  | "finance"
  | "finance-compact"
  | "workflow"
  | "workflow-shell"
  | "documents"
  | "quality-safety"
  | "planning"
  | "contracts";

export const NAV_CLUSTERS: Record<ClusterKey, readonly NavTab[]> = {
  /** Site Materials / Rate Library / Equipment / Production / Subcontractors / HR / Vendors */
  resources: [
    { label: "Materials & Procurement", href: "/materials" },
    { label: "Resource & Rate Library", href: "/rate-library" },
    { label: "Equipment & Fleet", href: "/equipment", moduleKey: "equipment" },
    { label: "Plant & Production", href: "/production", moduleKey: "production" },
    { label: "Subcontractors", href: "/subcontractors", moduleKey: "subcontractors" },
    { label: "HR / Staff", href: "/hr", moduleKey: "hr" },
    { label: "Vendors Directory", href: "/vendors", moduleKey: "purchaseOrders" },
  ],

  /** Full finance strip: Day Book, Payables, IPC, Tax, Cash Flow, Budget */
  finance: [
    { label: "Payments", href: "/payments" },
    { label: "Accounting & Day Book", href: "/accounting", moduleKey: "accounting" },
    { label: "IPC Certificates", href: "/ipc", moduleKey: "ipc" },
    { label: "Tax Summary", href: "/tax-summary", moduleKey: "vat" },
    { label: "Cash Flow", href: "/cash-flow" },
    { label: "Budget vs Actual", href: "/budget-variance" },
  ],

  /** Compact finance strip used by accounting / payments / tax-summary pages */
  "finance-compact": [
    { label: "Day Book & Cashbook", href: "/accounting", moduleKey: "accounting" },
    { label: "Parties & Payables", href: "/payments" },
    { label: "Reports & Compliance", href: "/tax-summary", moduleKey: "vat" },
  ],

  /** Workflow cluster as rendered on meetings / correspondence pages */
  workflow: [
    { label: "RFIs", href: "/workflow/rfi", moduleKey: "rfi" },
    { label: "Daily Program", href: "/workflow/program", moduleKey: "dailyProgramme" },
    { label: "Daily Reports", href: "/workflow/reports" },
    { label: "Correspondence", href: "/correspondence", moduleKey: "correspondence" },
    { label: "Meetings", href: "/meetings" },
  ],

  /** Tabs inside the /workflow shell layout (hrefs relative to /workflow) */
  "workflow-shell": [
    { label: "RFIs", href: "/rfi", absolute: false },
    { label: "Daily Program", href: "/program", absolute: false },
    { label: "My Tasks", href: "/program/my-tasks", absolute: false },
    { label: "Daily Reports", href: "/reports", absolute: false },
    { label: "Correspondence", href: "/correspondence", absolute: true },
    { label: "Meetings", href: "/meetings", absolute: true },
  ],

  /** Drawings / Photo Progress / Submittals / Doc Center */
  documents: [
    { label: "Drawings", href: "/drawings", moduleKey: "drawings" },
    { label: "Photo Progress", href: "/drawings/progress" },
    { label: "Submittals", href: "/submittals", moduleKey: "submittals" },
    { label: "Doc Center", href: "/document-center", moduleKey: "documents" },
  ],

  /** Quality / Punch List / Safety */
  "quality-safety": [
    { label: "Quality", href: "/quality", moduleKey: "qualitySafety" },
    { label: "Punch List", href: "/punch-list", moduleKey: "punchList" },
    { label: "Safety", href: "/safety", moduleKey: "qualitySafety" },
  ],

  /** BOQ / Look-Ahead */
  planning: [
    { label: "BOQ", href: "/boq" },
    { label: "Look-Ahead", href: "/look-ahead", moduleKey: "dailyProgramme" },
  ],

  /** Contract & commercial strip used by the guarantees page */
  contracts: [
    { label: "BOQ & Rates", href: "/boq" },
    { label: "Bank Guarantees & Insurance", href: "/guarantees", moduleKey: "guarantees" },
    { label: "IPC Certificates", href: "/ipc", moduleKey: "ipc" },
    { label: "Variation Orders", href: "/variations", moduleKey: "variations" },
    { label: "RFI / Workflow", href: "/workflow/rfi", moduleKey: "rfi" },
    { label: "Submittals", href: "/submittals", moduleKey: "submittals" },
  ],
};

// ── Module gating map ────────────────────────────────────────────
// Legacy AUTO_MODULE_MAP entries for hrefs that appear in no cluster
// (orphan pages and sub-routes). Cluster tabs contribute their own
// moduleKey; this map covers the rest. Derived once, greppable here.

const ORPHAN_MODULE_KEYS: Record<string, ModuleKey> = {
  "/rfis": "rfi",
  "/hr/payroll": "hr",
  "/hr/leaves": "hr",
  "/subcontractors/billing": "subcontractors",
  "/daily-program": "dailyProgramme",
};

export const MODULE_KEY_BY_HREF: Readonly<Record<string, ModuleKey>> = (() => {
  const map: Record<string, ModuleKey> = { ...ORPHAN_MODULE_KEYS };
  for (const tabs of Object.values(NAV_CLUSTERS)) {
    for (const tab of tabs) {
      if (tab.moduleKey && !(tab.href in map)) map[tab.href] = tab.moduleKey;
    }
  }
  return map;
})();

// ── Sidebar navigation ───────────────────────────────────────────
// Extracted verbatim from app-sidebar.tsx. The sidebar component owns the
// rendering (active states, aero tokens); the registry owns the data.

/** Enterprise Hub — global, out-of-project navigation. */
export const GLOBAL_NAV: readonly SidebarNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Inventory Hub", href: "/inventory", icon: Boxes },
  { label: "Finance & Accounts", href: "/finance", icon: ReceiptText },
  { label: "Drawings Vault", href: "/drawings", icon: Compass },
  { label: "Correspondence", href: "/correspondence", icon: Mail },
  { label: "Team & Workspace", href: "/team", icon: Users },
  { label: "Rate Catalogs", href: "/rate-catalogs", icon: Database },
];

/** Project Modules rail — hrefs relative to /projects/[id] ("" = overview). */
export const PROJECT_MODULE_NAV: readonly SidebarNavItem[] = [
  { label: "Project Overview", href: "", icon: LayoutDashboard },
  { label: "BoQ & Planning", href: "/boq", icon: ClipboardList },
  { label: "Workflow & RFIs", href: "/workflow/rfi", icon: ListChecks },
  { label: "Site Materials", href: "/materials", icon: Boxes },
  { label: "Site Accounting", href: "/accounting", icon: ReceiptText },
  { label: "Quality & Safety", href: "/quality", icon: HardHat },
  { label: "Variation Orders", href: "/variations", icon: FileSignature },
  { label: "Rate Library", href: "/rate-library", icon: BookOpen },
];

// ── Helpers ──────────────────────────────────────────────────────

/** Resolve a tab's gating key: explicit moduleKey wins, else href lookup. */
export function moduleKeyForTab(tab: NavTab): ModuleKey | undefined {
  return tab.moduleKey ?? MODULE_KEY_BY_HREF[tab.href];
}
