export const STANDARD_CATEGORIES = [
  "Roads & Highways",
  "Hydropower & Tunneling",
  "Civil & Concrete",
  "Steel & Rebar",
  "Plumbing & Sanitary",
  "Electrical & Power",
  "Finishes & Carpentry",
  "Fuel & Lubricants",
  "Equipment & Machinery",
  "Labor",
  "General Hardware",
] as const;

export type StandardCategory = (typeof STANDARD_CATEGORIES)[number];

export interface CategoryTheme {
  name: string;
  // Border colors
  border: string;
  borderHover: string;
  // Reddit-style vertical & horizontal thread branch line classes
  guideLine: string;
  guideLineActive: string;
  subGuideLine: string;
  branchLine: string;
  branchLineActive: string;
  // Backgrounds & accents
  headerBg: string;
  badge: string;
  text: string;
  icon: string;
  dot: string;
}

export const CATEGORY_PALETTE: CategoryTheme[] = [
  {
    name: "amber",
    border: "border-amber-500/50 dark:border-amber-500/40",
    borderHover: "hover:border-amber-500",
    guideLine: "border-l-2 border-amber-500/40 dark:border-amber-400/30 hover:border-amber-500 dark:hover:border-amber-400 transition-colors",
    guideLineActive: "border-l-2 border-amber-500 dark:border-amber-400",
    subGuideLine: "border-l-2 border-amber-500/30 dark:border-amber-400/25 hover:border-amber-500/60 transition-colors",
    branchLine: "border-amber-500/40 dark:border-amber-400/30",
    branchLineActive: "border-amber-500 dark:border-amber-400",
    headerBg: "bg-amber-500/10 dark:bg-amber-950/40 border-amber-500/30",
    badge: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
    text: "text-amber-700 dark:text-amber-300",
    icon: "text-amber-500 fill-amber-500/20",
    dot: "bg-amber-500",
  },
  {
    name: "sky",
    border: "border-sky-500/50 dark:border-sky-500/40",
    borderHover: "hover:border-sky-500",
    guideLine: "border-l-2 border-sky-500/40 dark:border-sky-400/30 hover:border-sky-500 dark:hover:border-sky-400 transition-colors",
    guideLineActive: "border-l-2 border-sky-500 dark:border-sky-400",
    subGuideLine: "border-l-2 border-sky-500/30 dark:border-sky-400/25 hover:border-sky-500/60 transition-colors",
    branchLine: "border-sky-500/40 dark:border-sky-400/30",
    branchLineActive: "border-sky-500 dark:border-sky-400",
    headerBg: "bg-sky-500/10 dark:bg-sky-950/40 border-sky-500/30",
    badge: "bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30",
    text: "text-sky-700 dark:text-sky-300",
    icon: "text-sky-500 fill-sky-500/20",
    dot: "bg-sky-500",
  },
  {
    name: "emerald",
    border: "border-emerald-500/50 dark:border-emerald-500/40",
    borderHover: "hover:border-emerald-500",
    guideLine: "border-l-2 border-emerald-500/40 dark:border-emerald-400/30 hover:border-emerald-500 dark:hover:border-emerald-400 transition-colors",
    guideLineActive: "border-l-2 border-emerald-500 dark:border-emerald-400",
    subGuideLine: "border-l-2 border-emerald-500/30 dark:border-emerald-400/25 hover:border-emerald-500/60 transition-colors",
    branchLine: "border-emerald-500/40 dark:border-emerald-400/30",
    branchLineActive: "border-emerald-500 dark:border-emerald-400",
    headerBg: "bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500/30",
    badge: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-300",
    icon: "text-emerald-500 fill-emerald-500/20",
    dot: "bg-emerald-500",
  },
  {
    name: "purple",
    border: "border-purple-500/50 dark:border-purple-500/40",
    borderHover: "hover:border-purple-500",
    guideLine: "border-l-2 border-purple-500/40 dark:border-purple-400/30 hover:border-purple-500 dark:hover:border-purple-400 transition-colors",
    guideLineActive: "border-l-2 border-purple-500 dark:border-purple-400",
    subGuideLine: "border-l-2 border-purple-500/30 dark:border-purple-400/25 hover:border-purple-500/60 transition-colors",
    branchLine: "border-purple-500/40 dark:border-purple-400/30",
    branchLineActive: "border-purple-500 dark:border-purple-400",
    headerBg: "bg-purple-500/10 dark:bg-purple-950/40 border-purple-500/30",
    badge: "bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-500/30",
    text: "text-purple-700 dark:text-purple-300",
    icon: "text-purple-500 fill-purple-500/20",
    dot: "bg-purple-500",
  },
  {
    name: "teal",
    border: "border-teal-500/50 dark:border-teal-500/40",
    borderHover: "hover:border-teal-500",
    guideLine: "border-l-2 border-teal-500/40 dark:border-teal-400/30 hover:border-teal-500 dark:hover:border-teal-400 transition-colors",
    guideLineActive: "border-l-2 border-teal-500 dark:border-teal-400",
    subGuideLine: "border-l-2 border-teal-500/30 dark:border-teal-400/25 hover:border-teal-500/60 transition-colors",
    branchLine: "border-teal-500/40 dark:border-teal-400/30",
    branchLineActive: "border-teal-500 dark:border-teal-400",
    headerBg: "bg-teal-500/10 dark:bg-teal-950/40 border-teal-500/30",
    badge: "bg-teal-500/15 text-teal-800 dark:text-teal-300 border-teal-500/30",
    text: "text-teal-700 dark:text-teal-300",
    icon: "text-teal-500 fill-teal-500/20",
    dot: "bg-teal-500",
  },
  {
    name: "orange",
    border: "border-orange-500/50 dark:border-orange-500/40",
    borderHover: "hover:border-orange-500",
    guideLine: "border-l-2 border-orange-500/40 dark:border-orange-400/30 hover:border-orange-500 dark:hover:border-orange-400 transition-colors",
    guideLineActive: "border-l-2 border-orange-500 dark:border-orange-400",
    subGuideLine: "border-l-2 border-orange-500/30 dark:border-orange-400/25 hover:border-orange-500/60 transition-colors",
    branchLine: "border-orange-500/40 dark:border-orange-400/30",
    branchLineActive: "border-orange-500 dark:border-orange-400",
    headerBg: "bg-orange-500/10 dark:bg-orange-950/40 border-orange-500/30",
    badge: "bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/30",
    text: "text-orange-700 dark:text-orange-300",
    icon: "text-orange-500 fill-orange-500/20",
    dot: "bg-orange-500",
  },
  {
    name: "rose",
    border: "border-rose-500/50 dark:border-rose-500/40",
    borderHover: "hover:border-rose-500",
    guideLine: "border-l-2 border-rose-500/40 dark:border-rose-400/30 hover:border-rose-500 dark:hover:border-rose-400 transition-colors",
    guideLineActive: "border-l-2 border-rose-500 dark:border-rose-400",
    subGuideLine: "border-l-2 border-rose-500/30 dark:border-rose-400/25 hover:border-rose-500/60 transition-colors",
    branchLine: "border-rose-500/40 dark:border-rose-400/30",
    branchLineActive: "border-rose-500 dark:border-rose-400",
    headerBg: "bg-rose-500/10 dark:bg-rose-950/40 border-rose-500/30",
    badge: "bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-500/30",
    text: "text-rose-700 dark:text-rose-300",
    icon: "text-rose-500 fill-rose-500/20",
    dot: "bg-rose-500",
  },
  {
    name: "cyan",
    border: "border-cyan-500/50 dark:border-cyan-500/40",
    borderHover: "hover:border-cyan-500",
    guideLine: "border-l-2 border-cyan-500/40 dark:border-cyan-400/30 hover:border-cyan-500 dark:hover:border-cyan-400 transition-colors",
    guideLineActive: "border-l-2 border-cyan-500 dark:border-cyan-400",
    subGuideLine: "border-l-2 border-cyan-500/30 dark:border-cyan-400/25 hover:border-cyan-500/60 transition-colors",
    branchLine: "border-cyan-500/40 dark:border-cyan-400/30",
    branchLineActive: "border-cyan-500 dark:border-cyan-400",
    headerBg: "bg-cyan-500/10 dark:bg-cyan-950/40 border-cyan-500/30",
    badge: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/30",
    text: "text-cyan-700 dark:text-cyan-300",
    icon: "text-cyan-500 fill-cyan-500/20",
    dot: "bg-cyan-500",
  },
  {
    name: "fuchsia",
    border: "border-fuchsia-500/50 dark:border-fuchsia-500/40",
    borderHover: "hover:border-fuchsia-500",
    guideLine: "border-l-2 border-fuchsia-500/40 dark:border-fuchsia-400/30 hover:border-fuchsia-500 dark:hover:border-fuchsia-400 transition-colors",
    guideLineActive: "border-l-2 border-fuchsia-500 dark:border-fuchsia-400",
    subGuideLine: "border-l-2 border-fuchsia-500/30 dark:border-fuchsia-400/25 hover:border-fuchsia-500/60 transition-colors",
    branchLine: "border-fuchsia-500/40 dark:border-fuchsia-400/30",
    branchLineActive: "border-fuchsia-500 dark:border-fuchsia-400",
    headerBg: "bg-fuchsia-500/10 dark:bg-fuchsia-950/40 border-fuchsia-500/30",
    badge: "bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300 border-fuchsia-500/30",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    icon: "text-fuchsia-500 fill-fuchsia-500/20",
    dot: "bg-fuchsia-500",
  },
  {
    name: "lime",
    border: "border-lime-500/50 dark:border-lime-500/40",
    borderHover: "hover:border-lime-500",
    guideLine: "border-l-2 border-lime-500/40 dark:border-lime-400/30 hover:border-lime-500 dark:hover:border-lime-400 transition-colors",
    guideLineActive: "border-l-2 border-lime-500 dark:border-lime-400",
    subGuideLine: "border-l-2 border-lime-500/30 dark:border-lime-400/25 hover:border-lime-500/60 transition-colors",
    branchLine: "border-lime-500/40 dark:border-lime-400/30",
    branchLineActive: "border-lime-500 dark:border-lime-400",
    headerBg: "bg-lime-500/10 dark:bg-lime-950/40 border-lime-500/30",
    badge: "bg-lime-500/15 text-lime-800 dark:text-lime-300 border-lime-500/30",
    text: "text-lime-700 dark:text-lime-300",
    icon: "text-lime-500 fill-lime-500/20",
    dot: "bg-lime-500",
  },
  {
    name: "indigo",
    border: "border-indigo-500/50 dark:border-indigo-500/40",
    borderHover: "hover:border-indigo-500",
    guideLine: "border-l-2 border-indigo-500/40 dark:border-indigo-400/30 hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors",
    guideLineActive: "border-l-2 border-indigo-500 dark:border-indigo-400",
    subGuideLine: "border-l-2 border-indigo-500/30 dark:border-indigo-400/25 hover:border-indigo-500/60 transition-colors",
    branchLine: "border-indigo-500/40 dark:border-indigo-400/30",
    branchLineActive: "border-indigo-500 dark:border-indigo-400",
    headerBg: "bg-indigo-500/10 dark:bg-indigo-950/40 border-indigo-500/30",
    badge: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/30",
    text: "text-indigo-700 dark:text-indigo-300",
    icon: "text-indigo-500 fill-indigo-500/20",
    dot: "bg-indigo-500",
  },
];

/**
 * Returns a canonical sort rank (1 to 12) based on category name keywords.
 */
export function getCategorySortRank(categoryName: string): number {
  if (!categoryName) return 99;
  const norm = categoryName.toLowerCase().trim();

  // Exact standard category matches
  const exactIdx = STANDARD_CATEGORIES.findIndex((sc) => sc.toLowerCase() === norm);
  if (exactIdx !== -1) return exactIdx + 1;

  // Fuzzy keyword rank
  if (norm.includes("road") || norm.includes("highway") || norm.includes("pavement")) return 1;
  if (norm.includes("hydro") || norm.includes("tunnel") || norm.includes("water") || norm.includes("dam")) return 2;
  if (
    norm.includes("civil") ||
    norm.includes("concrete") ||
    norm.includes("cement") ||
    norm.includes("aggregate") ||
    norm.includes("sand") ||
    norm.includes("boulder") ||
    norm.includes("brick") ||
    norm.includes("masonry") ||
    norm.includes("earthwork") ||
    norm.includes("soil") ||
    norm.includes("stone") ||
    norm.includes("gravel")
  )
    return 3;
  if (norm.includes("steel") || norm.includes("rebar") || norm.includes("iron") || norm.includes("metal") || norm.includes("tmt")) return 4;
  if (norm.includes("plumb") || norm.includes("sanitary") || norm.includes("pipe") || norm.includes("pvc") || norm.includes("drain") || norm.includes("fitting")) return 5;
  if (norm.includes("electr") || norm.includes("power") || norm.includes("solar") || norm.includes("cable") || norm.includes("wire") || norm.includes("mcb") || norm.includes("light")) return 6;
  if (norm.includes("finish") || norm.includes("carpent") || norm.includes("paint") || norm.includes("tile") || norm.includes("wood") || norm.includes("glass") || norm.includes("plaster") || norm.includes("flooring")) return 7;
  if (norm.includes("fuel") || norm.includes("diesel") || norm.includes("lubricant") || norm.includes("petrol") || norm.includes("oil") || norm.includes("bitumen")) return 8;
  if (norm.includes("equip") || norm.includes("machin") || norm.includes("plant") || norm.includes("tool") || norm.includes("vehicle") || norm.includes("excavator") || norm.includes("roller") || norm.includes("grader") || norm.includes("truck")) return 9;
  if (norm.includes("labor") || norm.includes("labour") || norm.includes("manpower") || norm.includes("worker") || norm.includes("mason") || norm.includes("operator") || norm.includes("miner") || norm.includes("blaster")) return 10;
  if (norm.includes("hardware") || norm.includes("general") || norm.includes("fastener") || norm.includes("nail") || norm.includes("bolt") || norm.includes("misc")) return 11;

  return 50;
}

export const getCategoryIndex = getCategorySortRank;

/**
 * Sorts category names canonically (Roads -> Hydro -> Civil/Cement/Aggregate -> Steel -> Plumbing -> Electrical...).
 */
export function sortCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const rankA = getCategorySortRank(a);
    const rankB = getCategorySortRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });
}

/**
 * Returns a distinct, deterministic Reddit-style color theme for any category.
 */
export function getCategoryTheme(categoryName: string, fallbackIdx: number = 0): CategoryTheme {
  if (!categoryName) return CATEGORY_PALETTE[0];
  const norm = categoryName.toLowerCase().trim();

  // Explicit mappings for categories
  if (norm.includes("road") || norm.includes("highway") || norm.includes("pavement")) return CATEGORY_PALETTE[0]; // amber
  if (norm.includes("hydro") || norm.includes("tunnel") || norm.includes("water") || norm.includes("dam")) return CATEGORY_PALETTE[1]; // sky
  if (
    norm.includes("civil") ||
    norm.includes("concrete") ||
    norm.includes("cement") ||
    norm.includes("aggregate") ||
    norm.includes("sand") ||
    norm.includes("boulder") ||
    norm.includes("brick") ||
    norm.includes("masonry") ||
    norm.includes("earthwork") ||
    norm.includes("soil") ||
    norm.includes("stone") ||
    norm.includes("gravel")
  )
    return CATEGORY_PALETTE[2]; // emerald
  if (norm.includes("steel") || norm.includes("rebar") || norm.includes("iron") || norm.includes("metal") || norm.includes("tmt")) return CATEGORY_PALETTE[3]; // purple
  if (norm.includes("plumb") || norm.includes("sanitary") || norm.includes("pipe") || norm.includes("pvc") || norm.includes("drain") || norm.includes("fitting")) return CATEGORY_PALETTE[4]; // teal
  if (norm.includes("electr") || norm.includes("power") || norm.includes("solar") || norm.includes("cable") || norm.includes("wire") || norm.includes("light")) return CATEGORY_PALETTE[5]; // orange
  if (norm.includes("finish") || norm.includes("carpent") || norm.includes("paint") || norm.includes("tile") || norm.includes("wood") || norm.includes("glass") || norm.includes("plaster") || norm.includes("flooring")) return CATEGORY_PALETTE[6]; // rose
  if (norm.includes("fuel") || norm.includes("diesel") || norm.includes("lubricant") || norm.includes("petrol") || norm.includes("oil") || norm.includes("bitumen")) return CATEGORY_PALETTE[7]; // cyan
  if (norm.includes("equip") || norm.includes("machin") || norm.includes("plant") || norm.includes("tool") || norm.includes("vehicle") || norm.includes("excavator") || norm.includes("roller")) return CATEGORY_PALETTE[8]; // fuchsia
  if (norm.includes("labor") || norm.includes("labour") || norm.includes("manpower") || norm.includes("worker") || norm.includes("mason") || norm.includes("operator")) return CATEGORY_PALETTE[9]; // lime
  if (norm.includes("hardware") || norm.includes("general") || norm.includes("fastener") || norm.includes("nail") || norm.includes("bolt")) return CATEGORY_PALETTE[10]; // indigo

  // Deterministic hash based on category string for any custom categories
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = (hash << 5) - hash + categoryName.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % CATEGORY_PALETTE.length;
  return CATEGORY_PALETTE[idx] || CATEGORY_PALETTE[fallbackIdx % CATEGORY_PALETTE.length];
}
