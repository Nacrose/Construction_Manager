import { describe, it, expect } from "vitest";
import {
  NAV_CLUSTERS,
  MODULE_KEY_BY_HREF,
  GLOBAL_NAV,
  PROJECT_MODULE_NAV,
  moduleKeyForTab,
  type ClusterKey,
} from "./nav-registry";

/**
 * Nav registry invariants.
 *
 * The registry is the single source of truth for navigation: tab bars on 28
 * pages, the workflow shell, the sidebar, and module gating all derive from
 * it. A regression here silently changes what site engineers can reach, so
 * these tests pin the structural contract:
 *
 *  1. hrefs are unique within a cluster (Link keys + active-state matching)
 *  2. every cluster declared in ClusterKey actually exists with >0 tabs
 *  3. hrefs are well-formed relative paths (start with "/", never "//")
 *  4. the module-gating map keeps its legacy keys (AUTO_MODULE_MAP parity —
 *     page-level module toggling must not change because of Phase D)
 *  5. sidebar arrays keep their exact entry count and hrefs (extractive
 *     migration: byte-identical data, relocated)
 */

describe("NAV_CLUSTERS structure", () => {
  const keys = Object.keys(NAV_CLUSTERS) as ClusterKey[];

  it("declares every cluster with at least one tab", () => {
    expect(keys.length).toBeGreaterThanOrEqual(9);
    for (const key of keys) {
      expect(NAV_CLUSTERS[key].length, `cluster "${key}" is empty`).toBeGreaterThan(0);
    }
  });

  it("has unique hrefs within each cluster", () => {
    for (const key of keys) {
      const hrefs = NAV_CLUSTERS[key].map((t) => t.href);
      expect(new Set(hrefs).size, `duplicate href in cluster "${key}"`).toBe(hrefs.length);
    }
  });

  it("has well-formed relative hrefs", () => {
    for (const key of keys) {
      for (const tab of NAV_CLUSTERS[key]) {
        expect(tab.href, `${key}: "${tab.href}"`).toMatch(/^\//);
        expect(tab.href, `${key}: "${tab.href}" must not contain "//"`).not.toContain("//");
        expect(tab.label.trim().length, `${key}: empty label`).toBeGreaterThan(0);
      }
    }
  });
});

describe("MODULE_KEY_BY_HREF gating map", () => {
  // Exact legacy AUTO_MODULE_MAP key set from module-tabs.tsx before Phase D.
  const LEGACY_KEYS = [
    "/ipc", "/tax-summary", "/vendors", "/workflow/rfi", "/rfis",
    "/submittals", "/correspondence", "/punch-list", "/quality", "/safety",
    "/production", "/drawings", "/document-center", "/hr", "/hr/payroll",
    "/hr/leaves", "/equipment", "/subcontractors", "/subcontractors/billing",
    "/variations", "/workflow/program", "/daily-program", "/look-ahead",
    "/accounting", "/guarantees",
  ];

  it("preserves every legacy gating key (no module toggle regressions)", () => {
    for (const href of LEGACY_KEYS) {
      expect(MODULE_KEY_BY_HREF[href], `lost gating for "${href}"`).toBeDefined();
    }
  });

  it("maps the exact legacy key set (no accidental new gates)", () => {
    expect(Object.keys(MODULE_KEY_BY_HREF).sort()).toEqual([...LEGACY_KEYS].sort());
  });

  it("spot-checks legacy href -> module pairs", () => {
    expect(MODULE_KEY_BY_HREF["/vendors"]).toBe("purchaseOrders");
    expect(MODULE_KEY_BY_HREF["/tax-summary"]).toBe("vat");
    expect(MODULE_KEY_BY_HREF["/workflow/rfi"]).toBe("rfi");
    expect(MODULE_KEY_BY_HREF["/punch-list"]).toBe("punchList");
  });
});

describe("moduleKeyForTab", () => {
  it("prefers an explicit moduleKey over the href map", () => {
    expect(
      moduleKeyForTab({ label: "X", href: "/quality", moduleKey: "punchList" })
    ).toBe("punchList");
  });

  it("falls back to the href map", () => {
    expect(moduleKeyForTab({ label: "Vendors", href: "/vendors" })).toBe("purchaseOrders");
  });

  it("returns undefined for ungated tabs", () => {
    expect(moduleKeyForTab({ label: "Payments", href: "/payments" })).toBeUndefined();
  });
});

describe("sidebar arrays (extractive parity)", () => {
  it("GLOBAL_NAV keeps its 8 enterprise entries", () => {
    expect(GLOBAL_NAV.map((n) => n.href)).toEqual([
      "/dashboard", "/projects", "/inventory", "/finance",
      "/drawings", "/correspondence", "/team", "/rate-catalogs",
    ]);
  });

  it("PROJECT_MODULE_NAV keeps its 8 module entries", () => {
    expect(PROJECT_MODULE_NAV.map((n) => n.href)).toEqual([
      "", "/boq", "/workflow/rfi", "/materials",
      "/accounting", "/quality", "/variations", "/rate-library",
    ]);
  });

  it("every sidebar entry has an icon component", () => {
    for (const nav of [...GLOBAL_NAV, ...PROJECT_MODULE_NAV]) {
      expect(nav.icon, `missing icon for "${nav.label}"`).toBeDefined();
    }
  });
});
