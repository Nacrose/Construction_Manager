/**
 * Category → Chart-of-Accounts code mapping for overhead expenses.
 *
 * Both SiteExpense (6001-6006) and HeadOfficeExpense (6100-6199) have a
 * free-text `category` field on their Prisma model. Previously both
 * hardcoded a single account code ("6006" for site, no mapping at all
 * for HO) — every expense ledgered as "Misc", defeating the
 * categorization that the chart of accounts defines specifically so a
 * P&L / ledger can break overhead down meaningfully.
 *
 * These helpers centralize the mapping so:
 *   - Both routers use the same logic.
 *   - The mapping is unit-testable without spinning up tRPC / Prisma.
 *   - Adding a new category → account-code mapping is a one-line change.
 */
import { CHART_OF_ACCOUNTS } from "@/lib/chart-of-accounts";

// Site Overhead account codes (6001-6006). See chart-of-accounts.ts.
const SITE_OVERHEAD_CODES = {
  rent: "6001",          // Site Overhead - Rent
  utility: "6002",       // Site Overhead - Utilities
  utilities: "6002",
  fuel: "6003",          // Site Overhead - Fuel & Vehicle
  vehicle: "6003",
  food: "6004",          // Site Overhead - Food & Mess
  mess: "6004",
  accommodation: "6004",
  safety: "6005",        // Site Overhead - Safety Equipment
  misc: "6006",          // Site Overhead - Misc
  general: "6006",
  other: "6006",
} as const;

// Head Office Overhead account codes (6100-6199). The chart of accounts
// currently only defines 6100 (Rent), 6102 (Utilities), 6103 (Vehicle/Fuel).
// Other categories fall back to a synthetic "6199" code that we look up
// in CHART_OF_ACCOUNTS; if not found there, we still emit the code so the
// journal entry line is created (it just won't join to a known account
// name until the chart is extended).
const HO_OVERHEAD_CODES = {
  rent: "6100",
  utility: "6102",
  utilities: "6102",
  fuel: "6103",
  vehicle: "6103",
  food: "6199",
  mess: "6199",
  safety: "6199",
  misc: "6199",
  general: "6199",
  other: "6199",
} as const;

/**
 * Returns the chart-of-accounts code for a site-overhead expense category.
 * Falls back to "6006" (Site Overhead - Misc) for unknown categories.
 *
 * Lookup is case-insensitive and trims whitespace.
 */
export function siteOverheadCodeForCategory(
  category: string | null | undefined,
): string {
  if (!category) return "6006";
  const key = category.trim().toLowerCase() as keyof typeof SITE_OVERHEAD_CODES;
  return SITE_OVERHEAD_CODES[key] ?? "6006";
}

/**
 * Returns the chart-of-accounts code for a head-office overhead expense
 * category. Falls back to "6199" (Head Office - Misc) for unknown
 * categories.
 *
 * Lookup is case-insensitive and trims whitespace.
 */
export function hoOverheadCodeForCategory(
  category: string | null | undefined,
): string {
  if (!category) return "6199";
  const key = category.trim().toLowerCase() as keyof typeof HO_OVERHEAD_CODES;
  return HO_OVERHEAD_CODES[key] ?? "6199";
}

/**
 * Returns the human-readable account name for a code, or null if the
 * code isn't in the chart of accounts.
 */
export function accountNameForCode(code: string): string | null {
  return CHART_OF_ACCOUNTS.find((c) => c.code === code)?.name ?? null;
}
