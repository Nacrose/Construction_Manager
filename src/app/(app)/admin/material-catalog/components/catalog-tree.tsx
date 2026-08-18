"use client";

import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Trash2,
  Edit2,
  Globe,
  Shield,
  BookOpen,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { sortCategories, getCategoryTheme } from "@/lib/category-theme";

export function CatalogTree({
  isLoading,
  treeData,
  isOrgScoped,
  isProjectScoped,
  collapsedCategories,
  collapsedGroups,
  toggleCategory,
  toggleGroup,
  selectedIds,
  toggleSelect,
  setCategoryDeleteTarget,
  setEditingItem,
  setDeleteConfirmIds,
  setCreateDialogOpen,
  projectCatalogIdSet,
}: {
  isLoading: boolean;
  treeData: Record<string, Record<string, any[]>>;
  isOrgScoped: boolean;
  isProjectScoped: boolean;
  collapsedCategories: Record<string, boolean>;
  collapsedGroups: Record<string, boolean>;
  toggleCategory: (cat: string) => void;
  toggleGroup: (cat: string, group: string) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  setCategoryDeleteTarget: (target: { category: string; groupName?: string } | null) => void;
  setEditingItem: (item: any) => void;
  setDeleteConfirmIds: (ids: string[]) => void;
  setCreateDialogOpen: (val: boolean) => void;
  projectCatalogIdSet: Set<string>;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (Object.keys(treeData).length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground space-y-3">
        <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-medium">
          {isOrgScoped
            ? "No items in your organization catalog yet."
            : "No global catalog items found."}
        </p>
        {isOrgScoped ? (
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Click &quot;Sync from Global Catalog&quot; above to selectively import items into
            your organization catalog, or add a custom material.
          </p>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateDialogOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Create Global Item
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sortCategories(Object.keys(treeData)).map((category, catIdx) => {
        const groups = treeData[category];
        const isCatCollapsed = collapsedCategories[category];
        const catItemCount = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
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
            {/* LEVEL 1: Main Category Header with Theme Color Accent */}
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
              {/* Category-level archive button */}
              {!isProjectScoped && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategoryDeleteTarget({ category });
                  }}
                  title={`Archive all items in "${category}"`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* LEVEL 2 & LEVEL 3: Nested Tree */}
            {!isCatCollapsed && (
              <div
                className={cn(
                  "bg-background/30 py-1 px-2 sm:px-3 space-y-1 border-l-2 ml-3 sm:ml-4 my-1 transition-colors",
                  theme.subGuideLine
                )}
              >
                {Object.entries(groups)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([groupName, groupItems], grpIdx) => {
                    const groupKey = `${category}::${groupName}`;
                    const isGrpCollapsed = collapsedGroups[groupKey];

                    return (
                      <div key={groupName} className="space-y-0.5 my-0.5">
                        {/* LEVEL 2: Sub-Category / Group Header */}
                        <div
                          onClick={() => toggleGroup(category, groupName)}
                          className="flex items-center justify-between py-1 px-2 rounded-md bg-slate-700/15 dark:bg-zinc-800/30 cursor-pointer select-none text-foreground hover:bg-slate-700/25 transition-colors group/grp"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isGrpCollapsed ? (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0", theme.text)} />
                            )}
                            <Folder className={cn("h-3.5 w-3.5 shrink-0", theme.icon)} />
                            <span className="font-semibold text-xs text-foreground truncate">
                              {catNumber}.{grpIdx + 1} {groupName}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] font-mono bg-transparent text-muted-foreground border-muted-foreground/25 shadow-none shrink-0"
                            >
                              {groupItems.length}{" "}
                              {groupItems.length === 1 ? "spec" : "specs"}
                            </Badge>
                          </div>
                          {!isProjectScoped && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-5 w-5 text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 opacity-0 group-hover/grp:opacity-100 transition-opacity shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCategoryDeleteTarget({ category, groupName });
                              }}
                              title={`Archive all items in "${groupName}" group`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>

                        {/* LEVEL 3: Nested Specification / Leaf Items under Sub-Category */}
                        {!isGrpCollapsed && (
                          <div
                            className={cn(
                              "border-l-2 ml-3 sm:ml-4 pl-2 space-y-0.5 my-0.5",
                              theme.subGuideLine
                            )}
                          >
                            {groupItems.map((item, idx) => {
                              const isSingleStandardSpec =
                                groupItems.length === 1 &&
                                (!item.subCategory ||
                                  item.subCategory.toLowerCase() === "standard" ||
                                  item.subCategory.toLowerCase() === item.name.toLowerCase());
                              const specTag =
                                item.subCategory &&
                                item.subCategory.toLowerCase() !== "standard" &&
                                item.subCategory.toLowerCase() !== item.name.toLowerCase()
                                  ? item.subCategory
                                  : isSingleStandardSpec
                                    ? "Standard"
                                    : item.name || "(No Spec)";
                              const isProjectLinked =
                                isProjectScoped ||
                                (item as any).projectId ||
                                projectCatalogIdSet.has(item.id);
                              const canManage = true;

                              return (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between py-1 px-2 rounded-md hover:bg-muted/40 transition-colors group/spec text-xs select-none"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {canManage && (
                                      <input
                                        type="checkbox"
                                        checked={selectedIds.has(item.id)}
                                        onChange={() => toggleSelect(item.id)}
                                        className="rounded border-zinc-300 text-red-600 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                                      />
                                    )}
                                    <span className="font-mono text-muted-foreground text-[11px] w-12 shrink-0">
                                      {catNumber}.{grpIdx + 1}.{idx + 1}
                                    </span>
                                    <span className="font-medium text-foreground truncate">
                                      {specTag}
                                    </span>
                                    {isProjectLinked ? (
                                      <Badge
                                        variant="outline"
                                        className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 text-[9px] gap-0.5 shrink-0 font-medium"
                                      >
                                        <Shield className="h-2.5 w-2.5" /> Project Material
                                      </Badge>
                                    ) : item.isGlobal || !item.organizationId ? (
                                      <Badge
                                        variant="outline"
                                        className="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 text-[9px] gap-0.5 shrink-0 font-medium"
                                      >
                                        <Globe className="h-2.5 w-2.5" /> Global Master
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 text-[9px] gap-0.5 shrink-0 font-medium"
                                      >
                                        <Shield className="h-2.5 w-2.5" /> Org Custom
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="font-mono text-muted-foreground text-xs">
                                      {item.defaultUnit || "unit"}
                                    </span>
                                    {canManage && (
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover/spec:opacity-100 transition-opacity">
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                          onClick={() => setEditingItem(item)}
                                          title="Edit catalog item"
                                        >
                                          <Edit2 className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                          onClick={() => setDeleteConfirmIds([item.id])}
                                          title="Delete item"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
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
