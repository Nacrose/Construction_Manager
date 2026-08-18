export const DISCIPLINE_COLORS: Record<string, string> = {
  civil: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  structural: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  electrical: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  mechanical: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  architectural: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};

export const APPROVAL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950" },
  approved_internal: { label: "Internal ✓", color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950" },
  approved_consultant: { label: "Consultant ✓", color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-950" },
  approved_client: { label: "Client ✓", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950" },
  rejected: { label: "Rejected", color: "text-red-600", bg: "bg-red-100 dark:bg-red-950" },
};
