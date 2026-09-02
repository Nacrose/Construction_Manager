import { Fragment, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Trash2,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sortCategories, getCategoryTheme } from "@/lib/category-theme";
import { ScopeBadge, RateMissingBadge, type ScopeInfo } from "./scope-badge";

export interface CatalogLeafCtx {
  catNumber: number;
  grpIdx: number;
  idx: number;
  groupItems: any[];
}

export interface CatalogViewProps {
  treeData: Record<string, Record<string, any[]>>;
  collapsedCategories: Record<string, boolean>;
  collapsedGroups: Record<string, boolean>;
  toggleCategory: (cat: string) => void;
  toggleGroup: (cat: string, grp: string) => void;
  isLoading?: boolean;
  emptyState?: { title?: string; hint?: string; action?: ReactNode };
  /** Unified name cell content (display name). */
  getDisplayName: (item: any, groupName: string, groupItems: any[]) => string;
  /** Unified scope info for the badge. */
  getScope: (item: any) => ScopeInfo;
  /** Extra <th> elements rendered after the Unit column. */
  headerExtras?: ReactNode;
  /** Number of extra columns (for group-row colSpan). */
  extraColumnCount?: number;
  /** Extra <td> elements rendered after the Unit column for each leaf. */
  renderLeafExtras?: (item: any, ctx: CatalogLeafCtx) => ReactNode;
  /** Optional leading <th> (e.g. selection). */
  leadingHeader?: ReactNode;
  /** Optional leading <td> per leaf (e.g. checkbox). */
  renderLeading?: (item: any) => ReactNode;
  onArchiveCategory?: (cat: string) => void;
  onArchiveGroup?: (cat: string, grp: string) => void;
  /** Optional badge rendered in the group row (e.g. "N Linked"). */
  groupBadge?: (groupItems: any[]) => ReactNode;
  /** Enable horizontal scroll for wide tables (rate catalogs). */
  scrollable?: boolean;
  className?: string;
}

export function CatalogView({
  treeData,
  collapsedCategories,
  collapsedGroups,
  toggleCategory,
  toggleGroup,
  isLoading = false,
  emptyState,
  getDisplayName,
  getScope,
  headerExtras,
  extraColumnCount = 0,
  renderLeafExtras,
  leadingHeader,
  renderLeading,
  onArchiveCategory,
  onArchiveGroup,
  groupBadge,
  scrollable = true,
  className,
}: CatalogViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const categories = Object.keys(treeData);
  if (categories.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground space-y-3">
        <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-medium">
          {emptyState?.title || "No items found."}
        </p>
        {emptyState?.hint && (
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {emptyState.hint}
          </p>
        )}
        {emptyState?.action}
      </Card>
    );
  }

  const totalCols =
    (renderLeading ? 1 : 0) + 3 + extraColumnCount;

  return (
    <div className={cn("space-y-3", className)}>
      {sortCategories(categories).map((category, catIdx) => {
        const groups = treeData[category];
        const isCatCollapsed = collapsedCategories[category];
        const catItemCount = Object.values(groups).reduce(
          (sum, list) => sum + list.length,
          0
        );
        const catNumber = catIdx + 1;
        const theme = getCategoryTheme(category, catIdx);

        return (
          <div
            key={category}
            className={cn(
              "rounded-lg overflow-hidden border shadow-2xs transition-all",
              theme.border,
              !isCatCollapsed && "border-l-4"
            )}
          >
            {/* LEVEL 1: Category Header */}
            <div
              onClick={() => toggleCategory(category)}
              className={cn(
                "flex items-center justify-between py-1.5 px-3 cursor-pointer select-none rounded-t-lg transition-colors border-b border-border/50",
                theme.headerBg
              )}
            >
              <div className="flex items-center gap-2.5">
                {isCatCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className={cn("h-4 w-4", theme.text)} />
                )}
                {isCatCollapsed ? (
                  <Folder className={cn("h-4 w-4", theme.icon)} />
                ) : (
                  <FolderOpen className={cn("h-4 w-4", theme.icon)} />
                )}
                <span className="font-bold text-sm tracking-wide text-foreground">
                  {catNumber}.0 {category}
                </span>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] font-medium shadow-none", theme.badge)}
                >
                  {catItemCount} items across {Object.keys(groups).length} groups
                </Badge>
              </div>
              {!isCatCollapsed && onArchiveCategory && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchiveCategory(category);
                  }}
                  title={`Archive all items in "${category}"`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Category Table */}
            {!isCatCollapsed && (
              <div
                className={cn(
                  "border-t border-border/50 bg-background/30",
                  scrollable && "overflow-x-auto"
                )}
              >
                <table className="w-full text-xs font-mono tabular-nums text-left table-fixed">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-md text-primary border-b border-border/80 font-mono">
                    <tr className="border-b border-border/40 text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                      {renderLeading && (
                        <th className="py-2 px-2.5 font-semibold w-10 text-center">
                          {leadingHeader || null}
                        </th>
                      )}
                      <th className="py-2 px-2.5 font-semibold w-16 text-center">
                        SN
                      </th>
                      <th className="py-2 px-2.5 font-semibold min-w-[220px]">
                        Sub-Category / Spec
                      </th>
                      <th className="py-2 px-2 font-semibold w-16 text-center">
                        Unit
                      </th>
                      {headerExtras}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono text-xs">
                    {Object.entries(groups)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([groupName, groupItems], grpIdx) => {
                        const groupKey = `${category}::${groupName}`;
                        const isGrpCollapsed = collapsedGroups[groupKey];

                        return (
                          <Fragment key={groupName}>
                            {/* LEVEL 2: Group Row */}
                            <tr
                              onClick={() => toggleGroup(category, groupName)}
                              className="bg-[var(--navy-mid)]/15 dark:bg-zinc-800/40 hover:bg-[var(--navy-mid)]/25 cursor-pointer select-none transition-colors border-b border-border/60"
                            >
                              <td colSpan={totalCols} className="py-1 px-2.5">
                                <div className="flex items-center gap-2">
                                  {isGrpCollapsed ? (
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  ) : (
                                    <ChevronDown
                                      className={cn("h-3.5 w-3.5 shrink-0", theme.text)}
                                    />
                                  )}
                                  <Folder
                                    className={cn("h-3.5 w-3.5 shrink-0", theme.icon)}
                                  />
                                  <span className="font-semibold text-xs text-foreground">
                                    {catNumber}.{grpIdx + 1} {groupName}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono bg-transparent text-muted-foreground border-muted-foreground/25 shadow-none shrink-0"
                                  >
                                    {groupItems.length}{" "}
                                    {groupItems.length === 1 ? "spec" : "specs"}
                                  </Badge>
                                  {groupBadge && groupBadge(groupItems)}
                                </div>
                              </td>
                            </tr>

                            {/* LEVEL 3: Leaf Rows */}
                            {!isGrpCollapsed &&
                              groupItems.map((item, idx) => {
                                const snLabel = `${catNumber}.${grpIdx + 1}.${idx + 1}`;
                                const scope = getScope(item);
                                return (
                                  <tr
                                    key={item.id}
                                    className={cn(
                                      "group/spec hover:bg-muted/40 transition-colors",
                                      scope.rateMissing &&
                                        "bg-amber-500/5 dark:bg-amber-950/20"
                                    )}
                                  >
                                    {renderLeading && (
                                      <td className="py-1 px-2.5 text-center w-10 border-r border-border/30">
                                        {renderLeading(item)}
                                      </td>
                                    )}
                                    <td className="py-1 px-2.5 text-center text-xs text-muted-foreground font-mono w-16 border-r border-border/30">
                                      {snLabel}
                                    </td>
                                    <td className="py-1 px-2.5 text-xs font-medium text-foreground">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-mono text-xs truncate min-w-0 flex-1">
                                          {getDisplayName(item, groupName, groupItems)}
                                        </span>
                                        <span className="shrink-0 flex items-center gap-1">
                                          <ScopeBadge scope={scope} />
                                          {scope.rateMissing && <RateMissingBadge />}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-1 px-2 text-xs font-mono text-muted-foreground text-center w-16">
                                      {item.unit || item.defaultUnit || "unit"}
                                    </td>
                                    {renderLeafExtras &&
                                      renderLeafExtras(item, {
                                        catNumber,
                                        grpIdx,
                                        idx,
                                        groupItems,
                                      })}
                                  </tr>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
