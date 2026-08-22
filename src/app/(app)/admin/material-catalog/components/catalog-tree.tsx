"use client";

import { Edit2, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CatalogView } from "@/components/catalog/catalog-view";

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
  const getDisplayName = (item: any, _groupName: string, groupItems: any[]) => {
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
    return specTag;
  };

  const getScope = (item: any) => ({
    isGlobal: item.isGlobal || !item.organizationId,
    organizationId: item.organizationId,
    projectId: item.projectId,
    projectLinked:
      isProjectScoped || item.projectId || projectCatalogIdSet.has(item.id),
  });

  return (
    <CatalogView
      treeData={treeData}
      isLoading={isLoading}
      collapsedCategories={collapsedCategories}
      collapsedGroups={collapsedGroups}
      toggleCategory={toggleCategory}
      toggleGroup={toggleGroup}
      getDisplayName={getDisplayName}
      getScope={getScope}
      leadingHeader=""
      renderLeading={(item) => (
        <input
          type="checkbox"
          checked={selectedIds.has(item.id)}
          onChange={() => toggleSelect(item.id)}
          className="rounded border-zinc-300 text-red-600 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer shrink-0"
        />
      )}
      headerExtras={<th className="py-2 px-2 text-right font-semibold w-16">Actions</th>}
      extraColumnCount={1}
      renderLeafExtras={(item) => (
        <td className="py-1 px-2 text-right w-16">
          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover/spec:opacity-100 transition-opacity">
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
        </td>
      )}
      onArchiveCategory={
        !isProjectScoped ? (cat) => setCategoryDeleteTarget({ category: cat }) : undefined
      }
      onArchiveGroup={
        !isProjectScoped
          ? (cat, grp) => setCategoryDeleteTarget({ category: cat, groupName: grp })
          : undefined
      }
      emptyState={{
        title: isOrgScoped
          ? "No items in your organization catalog yet."
          : "No global catalog items found.",
        hint: isOrgScoped
          ? "Click 'Sync from Global Catalog' above to selectively import items into your organization catalog, or add a custom material."
          : undefined,
        action: !isOrgScoped ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateDialogOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Create Global Item
          </Button>
        ) : undefined,
      }}
    />
  );
}
