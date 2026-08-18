export const CATEGORIES = [
  { value: "qc", label: "QC" },
  { value: "design", label: "Design" },
  { value: "site", label: "Site" },
  { value: "account", label: "Account" },
  { value: "contract", label: "Contract" },
  { value: "safety", label: "Safety" },
  { value: "procurement", label: "Procurement" },
  { value: "other", label: "Other" },
];

export const CATEGORY_COLORS: Record<string, string> = {
  qc: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  design: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  site: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  account: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  contract: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  safety: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  procurement: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export const PARTIES = ["Client", "Consultant", "Contractor", "Subcontractor", "Supplier", "Other"];
