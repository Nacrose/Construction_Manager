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
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 text-[9px] gap-0.5 shrink-0 whitespace-nowrap font-medium",
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
        "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 text-[9px] gap-0.5 shrink-0 whitespace-nowrap font-medium",
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
