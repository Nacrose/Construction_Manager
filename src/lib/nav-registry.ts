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
  CalendarRange, FolderOpen,
} from "lucide-react";
import type { ModuleKey } from "@/lib/project-modules";
import type { CapabilityRequirement, OperatingCapabilities } from "@/lib/capabilities";
import { describeCapabilityShortfall } from "@/lib/capabilities";

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
  /** Resolved-capability requirement (ADR-0004): hidden when unmet. */
  cap?: CapabilityRequirement;
};

export type SidebarNavItem = {
  label: string;
  /** Global nav: absolute app path. Project modules: relative to /projects/[id]. */
  href: string;
  icon: NavIcon;
  /** Visual grouping only; routing and authorisation remain unchanged. */
  group?: string;
  /** Resolved-capability requirement (ADR-0004): hidden when unmet. */
  cap?: CapabilityRequirement;
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
    // Materials stays visible for EVERY capability set: direct purchases are
    // first-class (ADR product principles) even when procurementChain=none —
    // the requisition/PO/quote tabs inside the page are server-gated.
    { label: "Materials & Procurement", href: "/materials" },
    { label: "Resource & Rate Library", href: "/rate-library" },
    { label: "Equipment & Fleet", href: "/equipment", moduleKey: "equipment" },
    { label: "Plant & Production", href: "/production", moduleKey: "production" },
    { label: "Subcontractors", href: "/subcontractors", moduleKey: "subcontractors" },
    { label: "HR / Staff", href: "/hr", moduleKey: "hr", cap: { workforcePlanning: true } },
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

/**
 * Capability requirements by href (ADR-0004 §4): the nav-level projection of
 * "this surface does not exist server-side under that capability map". Only
 * entries whose PAGES are server-gated by capabilityGuard belong here — a
 * hidden link can never unlock anything; a shown link can still 403.
 * Cluster `cap` fields feed this map automatically; orphans are explicit.
 */
const ORPHAN_CAPABILITY_REQS: Record<string, CapabilityRequirement> = {
  "/hr/payroll": { workforcePlanning: true },
  "/hr/leaves": { workforcePlanning: true },
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
  { label: "Desk", href: "/dashboard", icon: LayoutDashboard, group: "Control" },
  { label: "Projects", href: "/projects", icon: FolderKanban, group: "Control" },
  // Stores/stock control does not exist server-side under inventoryControl
  // "none" (ADR-0004 §4 owner_led) — the hub is a projection of that.
  { label: "Inventory", href: "/inventory", icon: Boxes, group: "Organisation", cap: { inventoryControl: "basic" } },
  { label: "Finance", href: "/finance", icon: ReceiptText, group: "Organisation" },
  { label: "Documents", href: "/drawings", icon: Compass, group: "Organisation" },
  { label: "Correspondence", href: "/correspondence", icon: Mail, group: "Organisation" },
  { label: "People", href: "/team", icon: Users, group: "Organisation" },
  { label: "Rate Catalogs", href: "/rate-catalogs", icon: Database, group: "Organisation" },
];

/** Project Modules rail — hrefs relative to /projects/[id] ("" = overview). */
export const PROJECT_MODULE_NAV: readonly SidebarNavItem[] = [
  { label: "Overview", href: "", icon: LayoutDashboard, group: "Control" },
  { label: "Planning", href: "/gantt", icon: CalendarRange, group: "Control" },
  { label: "BOQ & Rates", href: "/boq", icon: ClipboardList, group: "Commercial" },
  { label: "IPC Certificates", href: "/ipc", icon: ReceiptText, group: "Commercial" },
  { label: "Variations", href: "/variations", icon: FileSignature, group: "Commercial" },
  { label: "Site Log", href: "/workflow/rfi", icon: ListChecks, group: "Site" },
  { label: "Materials", href: "/materials", icon: Boxes, group: "Site" },
  { label: "Quality & Safety", href: "/quality", icon: HardHat, group: "Site" },
  { label: "Documents", href: "/drawings", icon: FolderOpen, group: "Records" },
  { label: "Accounts", href: "/accounting", icon: ReceiptText, group: "Records" },
  { label: "Rate Library", href: "/rate-library", icon: BookOpen, group: "Records" },
];

/**
 * Capability requirements by href (ADR-0004 §4): the nav-level projection of
 * "this surface does not exist server-side under that capability map". Only
 * entries whose PAGES are server-gated by capabilityGuard belong here — a
 * hidden link can never unlock anything; a shown link can still 403.
 * Cluster `cap` fields, sidebar annotations and explicit orphans all feed
 * this map — declared after the arrays it harvests.
 */
export const CAPABILITY_REQ_BY_HREF: Readonly<Record<string, CapabilityRequirement>> = (() => {
  const map: Record<string, CapabilityRequirement> = { ...ORPHAN_CAPABILITY_REQS };
  const sources: ReadonlyArray<ReadonlyArray<{ href: string; cap?: CapabilityRequirement }>> = [
    ...Object.values(NAV_CLUSTERS),
    GLOBAL_NAV,
    PROJECT_MODULE_NAV,
  ];
  for (const tabs of sources) {
    for (const tab of tabs) {
      if (tab.cap && !(tab.href in map)) map[tab.href] = tab.cap;
    }
  }
  return map;
})();

// ── Helpers ──────────────────────────────────────────────────────

/** Resolve a tab's gating key: explicit moduleKey wins, else href lookup. */
export function moduleKeyForTab(tab: NavTab): ModuleKey | undefined {
  return tab.moduleKey ?? MODULE_KEY_BY_HREF[tab.href];
}

/**
 * Resolve a nav item's capability requirement (ADR-0004): the explicit
 * `cap` field wins, else the href map. Pure.
 */
export function capabilityReqFor(
  item: { href: string; cap?: CapabilityRequirement },
): CapabilityRequirement | undefined {
  return item.cap ?? CAPABILITY_REQ_BY_HREF[item.href];
}

/**
 * Filter nav items by the RESOLVED capability map (ADR-0004: a projection,
 * never the guard). `capabilities === null` (not loaded / unparsable) shows
 * everything — hiding nav because data is missing would be a regression
 * masquerading as policy, and a shown link can still 403 server-side, never
 * the reverse. Pure.
 */
export function filterNavByCapabilities<
  T extends { href: string; cap?: CapabilityRequirement },
>(items: readonly T[], capabilities: OperatingCapabilities | null): T[] {
  if (!capabilities) return [...items];
  return items.filter((item) => {
    const req = capabilityReqFor(item);
    if (!req) return true;
    return describeCapabilityShortfall(capabilities, req) === null;
  });
}
