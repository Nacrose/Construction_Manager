/**
 * Shared types and constants for the BOQ module.
 *
 * Extracted from page.tsx to:
 * - Reduce the page file size (was 2,751 lines)
 * - Enable type reuse across sibling component files
 * - Give each component file a focused responsibility
 */

export type Ingredient = {
  id: string;
  name: string;
  type: string;
  calcMode: string;
  quantity: number;
  unit: string;
  percentage: number;
  pctBase: string;
  rate: number;
  amount: number;
};

export type BoqItem = {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  baselineQty: number | null;
  baselineRate: number | null;
  category: string | null;
  section: string | null;
  tags: string | null;
  keyTerms: string | null;
  sortOrder: number;
  locked: boolean;
  ingredients: Ingredient[];
};

/** Units selectable in the BOQ item editor dropdown. */
export const UNITS = ["cum", "sqm", "no", "m", "kg", "ton", "set", "lot", "hrs"];

/**
 * Tailwind classes for tag pills. Cycled by index so adjacent tags get
 * different colors. Kept in source (not Tailwind config) because the
 * classes are constructed at runtime and must be visible to the
 * Tailwind content scanner.
 */
export const TAG_COLORS = [
  "bg-success/15 text-success dark:bg-success dark:text-success/80",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info",
  "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
];
