import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  submitted:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  approved:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  rejected:
    "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  closed:
    "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export function RfiStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("capitalize", STATUS_STYLES[status] ?? STATUS_STYLES.draft, className)}
    >
      {status.replace("_", " ")}
    </Badge>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  normal:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function RfiPriorityBadge({ priority, className }: { priority: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.normal,
        className
      )}
    >
      {priority}
    </Badge>
  );
}

