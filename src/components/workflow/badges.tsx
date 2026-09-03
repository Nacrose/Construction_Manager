import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft:
    "bg-muted text-foreground/80 dark:bg-[var(--navy-mid)] dark:text-foreground/80",
  submitted:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  approved:
    "bg-success/15 text-success dark:bg-success dark:text-success/80",
  rejected:
    "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  closed:
    "bg-muted text-muted-foreground dark:bg-[var(--navy-mid)] dark:text-muted-foreground/80",
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
  low: "bg-muted text-muted-foreground dark:bg-[var(--navy-mid)] dark:text-muted-foreground/80",
  normal:
    "bg-muted text-foreground/80 dark:bg-[var(--navy-mid)] dark:text-foreground/80",
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

