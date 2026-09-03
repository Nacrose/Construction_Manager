import { Badge } from "@/components/ui/badge";
import { Globe, Building2, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScopeInfo {
  isGlobal?: boolean;
  organizationId?: string | null;
  projectId?: string | null;
  projectLinked?: boolean;
  standalone?: boolean;
  rateMissing?: boolean;
}

/** Unified scope badge used by both the Material Catalog and Rate Catalog. */
export function ScopeBadge({
  scope,
  className,
}: {
  scope: ScopeInfo;
  className?: string;
}) {
  if (scope.standalone) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/80 text-[9px] gap-0.5 shrink-0 whitespace-nowrap font-medium",
          className
        )}
        title="Rate exists in Rate Catalog without a linked entry in Material Catalog"
      >
        <Zap className="h-2.5 w-2.5 text-amber-500" /> Standalone Rate
      </Badge>
    );
  }
  if (scope.projectLinked || scope.projectId) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "bg-success/10 text-success dark:bg-success/40 dark:text-success/80 border-success/30 text-[9px] gap-0.5 shrink-0 whitespace-nowrap font-medium",
          className
        )}
        title="In Project Material Inventory"
      >
        <Shield className="h-2.5 w-2.5" /> Project
      </Badge>
    );
  }
  if (scope.isGlobal) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 text-[9px] gap-0.5 shrink-0 whitespace-nowrap font-medium",
          className
        )}
        title="Global (Admin) Catalog Item"
      >
        <Globe className="h-2.5 w-2.5" /> Admin
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "bg-info/10 text-info dark:bg-[var(--navy-deep)]/40 dark:text-info/80 border-info/30 text-[9px] gap-0.5 shrink-0 whitespace-nowrap font-medium",
        className
      )}
      title="Organization Catalog Item"
    >
      <Building2 className="h-2.5 w-2.5" /> Org
    </Badge>
  );
}

export function RateMissingBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 text-[9px] gap-0.5 shrink-0",
        className
      )}
    >
      Rate Missing
    </Badge>
  );
}
