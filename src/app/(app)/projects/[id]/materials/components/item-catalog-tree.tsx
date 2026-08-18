"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BookOpen,
  Plus,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Trash2,
  Edit2,
  Globe,
  Tag,
  DollarSign,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sortCategories, getCategoryTheme } from "@/lib/category-theme";

export function ItemCatalogTree({
  treeData,
  collapsedCategories,
  toggleCategory,
  collapsedGroups,
  toggleGroup,
  existingCatalogIds,
  existingSpecs,
  onImportToProject,
  onBulkImportCategory,
  onEditItem,
  onDeleteItem,
  isImporting,
  isBulkImporting,
  search,
  categoryFilter,
  onOpenCreateDialog,
}: {
  treeData: Record<string, Record<string, any[]>>;
  collapsedCategories: Record<string, boolean>;
  toggleCategory: (cat: string) => void;
  collapsedGroups: Record<string, boolean>;
  toggleGroup: (cat: string, group: string) => void;
  existingCatalogIds: Set<string | null | undefined>;
  existingSpecs: Set<string>;
  onImportToProject: (item: any) => void;
  onBulkImportCategory: (cat: string) => void;
  onEditItem: (item: any) => void;
  onDeleteItem: (id: string) => void;
  isImporting: boolean;
  isBulkImporting: boolean;
  search: string;
  categoryFilter: string;
  onOpenCreateDialog: () => void;
}) {
  if (Object.keys(treeData).length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground space-y-3">
        <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-medium">No items found in Master Catalog</p>
        <p className="text-xs max-w-sm mx-auto">
          {search || categoryFilter !== "all"
            ? "Try changing your search or filter settings."
            : "Get started by adding items to the Master Catalog."}
        </p>
        <Button
          size="sm"
          onClick={onOpenCreateDialog}
          className="gap-1 text-xs bg-amber-600 hover:bg-amber-700 text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Add First Item to Catalog
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sortCategories(Object.keys(treeData)).map((category, catIdx) => {
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
            {/* LEVEL 1: Main Category Header */}
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
                  {catItemCount} specs across {Object.keys(groups).length} groups
                </Badge>
              </div>

              {/* Bulk import whole category button */}
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onBulkImportCategory(category)}
                  disabled={isBulkImporting}
                  className="h-7 text-[11px] gap-1 bg-background/80 hover:bg-background border-border"
                >
                  <Plus className="h-3 w-3 text-amber-500" />
                  Add All {catItemCount} to Project
                </Button>
              </div>
            </div>

            {/* LEVEL 2 & 3: Groups & Leaf Items */}
            {!isCatCollapsed && (
              <div className="p-2 space-y-2 bg-background/40">
                {Object.entries(groups)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([groupName, groupItems], grpIdx) => {
                    const groupKey = `${category}::${groupName}`;
                    const isGrpCollapsed = collapsedGroups[groupKey];
                    const hasMultipleSpecs = groupItems.length > 1;

                    return (
                      <div
                        key={groupName}
                        className="rounded-md border border-border/40 bg-card overflow-hidden"
                      >
                        {/* LEVEL 2: Group Header */}
                        <div
                          onClick={() => toggleGroup(category, groupName)}
                          className="flex items-center justify-between py-1.5 px-3 bg-slate-700/10 dark:bg-zinc-800/40 hover:bg-slate-700/20 cursor-pointer select-none transition-colors border-b border-border/30"
                        >
                          <div className="flex items-center gap-2">
                            {isGrpCollapsed ? (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronDown
                                className={cn("h-3.5 w-3.5", theme.text)}
                              />
                            )}
                            <Folder className={cn("h-3.5 w-3.5", theme.icon)} />
                            <span className="font-semibold text-xs text-foreground">
                              {catNumber}.{grpIdx + 1} {groupName}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] font-mono bg-transparent text-muted-foreground border-muted-foreground/30 shadow-none"
                            >
                              {groupItems.length}{" "}
                              {groupItems.length === 1 ? "spec" : "specs"}
                            </Badge>
                          </div>
                        </div>

                        {/* LEVEL 3: Leaf Items */}
                        {!isGrpCollapsed && (
                          <div className="divide-y divide-border/30">
                            {groupItems.map((item, idx) => {
                              const isImported =
                                existingCatalogIds.has(item.id) ||
                                existingSpecs.has(
                                  item.subCategory
                                    ? `${item.name} — ${item.subCategory}`.toLowerCase()
                                    : item.name.toLowerCase()
                                );

                              return (
                                <div
                                  key={item.id}
                                  className={cn(
                                    "flex items-center justify-between py-2 px-3 hover:bg-muted/30 transition-colors text-xs",
                                    isImported && "bg-emerald-500/5 dark:bg-emerald-950/10"
                                  )}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-3">
                                    <span className="text-[10px] text-muted-foreground font-mono w-10 shrink-0">
                                      {catNumber}.{grpIdx + 1}.{idx + 1}
                                    </span>

                                    <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                                      {item.subCategory ? (
                                        <Badge
                                          variant="secondary"
                                          className="font-mono text-xs font-semibold px-2 py-0.5"
                                        >
                                          {item.subCategory}
                                        </Badge>
                                      ) : (
                                        <span className="font-medium text-foreground">
                                          {item.name}
                                        </span>
                                      )}

                                      <Badge
                                        variant="outline"
                                        className="text-[10px] font-mono text-muted-foreground bg-muted/30"
                                      >
                                        Unit: {item.defaultUnit || "unit"}
                                      </Badge>

                                      {item.defaultRate > 0 && (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 font-semibold gap-0.5"
                                        >
                                          <DollarSign className="h-2.5 w-2.5" />
                                          NPR {item.defaultRate.toLocaleString()}/
                                          {item.defaultUnit}
                                        </Badge>
                                      )}

                                      {item.rateSource && (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 gap-0.5 truncate max-w-[200px]"
                                          title={item.rateSource}
                                        >
                                          <Tag className="h-2.5 w-2.5 text-blue-500 shrink-0" />
                                          {item.rateSource}
                                        </Badge>
                                      )}

                                      {item.isGlobal ? (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 gap-0.5"
                                        >
                                          <Globe className="h-2.5 w-2.5 text-purple-500" />
                                          Global Catalog
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 gap-0.5"
                                        >
                                          <Building2 className="h-2.5 w-2.5 text-blue-500" />
                                          Org Catalog
                                        </Badge>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isImported ? (
                                      <Badge
                                        variant="secondary"
                                        className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] gap-1 font-medium"
                                      >
                                        <CheckCircle2 className="h-3 w-3" />
                                        In Project
                                      </Badge>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => onImportToProject(item)}
                                        disabled={isImporting}
                                        className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white font-medium"
                                      >
                                        <Plus className="h-3 w-3" />
                                        Add to Project
                                      </Button>
                                    )}

                                    {!item.isGlobal && (
                                      <>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                          onClick={() => onEditItem(item)}
                                          title="Edit Item Details"
                                        >
                                          <Edit2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                          onClick={() => onDeleteItem(item.id)}
                                          title="Delete Catalog Item"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
