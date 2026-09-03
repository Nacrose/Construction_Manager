export const DISCIPLINE_COLORS: Record<string, string> = {
  civil: "bg-success/15 text-success dark:bg-success dark:text-success/80",
  structural: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  electrical: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  mechanical: "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info",
  architectural: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};

export const APPROVAL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950" },
  approved_internal: { label: "Internal ✓", color: "text-info", bg: "bg-info/15 dark:bg-[var(--navy-deep)]" },
  approved_consultant: { label: "Consultant ✓", color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-950" },
  approved_client: { label: "Client ✓", color: "text-success", bg: "bg-success/15 dark:bg-success" },
  rejected: { label: "Rejected", color: "text-red-600", bg: "bg-red-100 dark:bg-red-950" },
};
