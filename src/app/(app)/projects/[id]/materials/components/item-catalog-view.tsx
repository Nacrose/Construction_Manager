"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Maximize2,
  Minimize2,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { CreateCatalogItemDialog } from "./create-catalog-item-dialog";
import { EditCatalogItemDialog } from "./edit-catalog-item-dialog";
import { ItemCatalogTree } from "./item-catalog-tree";

export function ItemCatalogView({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [rateSourceFilter, setRateSourceFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const { data: catalogData, isLoading } = trpc.materialCatalog.list.useQuery({
    includeGlobal: true,
    search: search.trim() || undefined,
  });

  const { data: projectMaterials } = trpc.material.list.useQuery({ projectId });

  const importToProjectMut = trpc.material.create.useMutation({
    onSuccess: (res) => {
      utils.material.list.invalidate({ projectId });
      toast.success(`"${res.material.name}" added to project directory!`);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkImportMut = trpc.materialCatalog.bulkImportToProject.useMutation({
    onSuccess: (res) => {
      utils.material.list.invalidate({ projectId });
      if (res.count > 0) {
        toast.success(`Successfully added ${res.count} items to project directory!`);
      } else {
        toast.info(res.message || "All items are already in project directory.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCatalogMut = trpc.materialCatalog.delete.useMutation({
    onSuccess: () => {
      utils.materialCatalog.list.invalidate();
      toast.success("Catalog item deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const items = catalogData?.items || [];
  const existingCatalogIds = new Set(
    projectMaterials?.materials.map((m) => m.materialCatalogId).filter(Boolean)
  );
  const existingSpecs = new Set(
    projectMaterials?.materials.map((m) =>
      (m as any).subCategory
        ? `${m.name} — ${(m as any).subCategory}`.toLowerCase()
        : m.name.toLowerCase()
    )
  );

  const filteredItems = items.filter((item) => {
    if (
      categoryFilter !== "all" &&
      (item.category || "General").toLowerCase() !== categoryFilter.toLowerCase()
    ) {
      return false;
    }
    if (
      rateSourceFilter !== "all" &&
      (item.rateSource || "").toLowerCase() !== rateSourceFilter.toLowerCase()
    ) {
      return false;
    }
    return true;
  });

  const treeData = filteredItems.reduce(
    (acc, item) => {
      const cat = item.category || "General";
      const groupName = item.name || "Unspecified";

      if (!acc[cat]) acc[cat] = {};
      if (!acc[cat][groupName]) acc[cat][groupName] = [];

      acc[cat][groupName].push(item);
      return acc;
    },
    {} as Record<string, Record<string, typeof items>>
  );

  const allCategories = Array.from(
    new Set(items.map((i) => i.category || "General"))
  ) as string[];
  const allRateSources = Array.from(
    new Set(items.map((i) => i.rateSource).filter(Boolean))
  ) as string[];

  const handleExpandAll = () => {
    setCollapsedCategories({});
    setCollapsedGroups({});
  };

  const handleCollapseAll = () => {
    const nextCats: Record<string, boolean> = {};
    const nextGroups: Record<string, boolean> = {};

    Object.keys(treeData).forEach((cat) => {
      nextCats[cat] = true;
      Object.keys(treeData[cat]).forEach((group) => {
        nextGroups[`${cat}::${group}`] = true;
      });
    });

    setCollapsedCategories(nextCats);
    setCollapsedGroups(nextGroups);
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleGroup = (cat: string, group: string) => {
    const key = `${cat}::${group}`;
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleImportToProject = (item: (typeof items)[0]) => {
    const catPrefix = (item.category || "MAT").substring(0, 3).toUpperCase();
    const specSuffix = item.subCategory
      ? `-${item.subCategory.replace(/\s+/g, "").toUpperCase()}`
      : "";
    importToProjectMut.mutate({
      projectId,
      name: item.name,
      code: `${catPrefix}${specSuffix}`,
      category: item.category || undefined,
      subCategory: item.subCategory || undefined,
      materialCatalogId: item.id,
      unit: item.defaultUnit || "unit",
      minStock: 0,
      currentStock: 0,
      reorderLevel: 0,
    });
  };

  const handleBulkImportCategory = (category: string) => {
    const categoryItemIds = (treeData[category] ? Object.values(treeData[category]).flat() : [])
      .map((i) => i.id);
    if (categoryItemIds.length === 0) return;
    bulkImportMut.mutate({
      projectId,
      catalogItemIds: categoryItemIds,
    });
  };

  const handleDeleteItem = (id: string) => {
    if (confirm("Delete this catalog item? This will not affect existing project materials.")) {
      deleteCatalogMut.mutate({ id });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Controls & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-2.5 rounded-lg border">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search catalog materials or specs..."
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="flex h-8 rounded border border-input bg-background px-2.5 text-xs shadow-2xs font-medium"
          >
            <option value="all">All Categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {allRateSources.length > 0 && (
            <select
              value={rateSourceFilter}
              onChange={(e) => setRateSourceFilter(e.target.value)}
              className="flex h-8 rounded border border-input bg-background px-2.5 text-xs shadow-2xs font-medium"
            >
              <option value="all">All Rate Sources</option>
              {allRateSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Add to Master Catalog
          </Button>

          <div className="flex items-center border-l pl-1.5 ml-0.5 gap-0.5 border-border">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleExpandAll}
              className="h-7 w-7 p-0"
              title="Expand All Groups"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCollapseAll}
              className="h-7 w-7 p-0"
              title="Collapse All Groups"
            >
              <Minimize2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main 3-Level Collapsible Tree */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      ) : (
        <ItemCatalogTree
          treeData={treeData}
          collapsedCategories={collapsedCategories}
          toggleCategory={toggleCategory}
          collapsedGroups={collapsedGroups}
          toggleGroup={toggleGroup}
          existingCatalogIds={existingCatalogIds}
          existingSpecs={existingSpecs}
          onImportToProject={handleImportToProject}
          onBulkImportCategory={handleBulkImportCategory}
          onEditItem={(item) => setEditingItem(item)}
          onDeleteItem={handleDeleteItem}
          isImporting={importToProjectMut.isPending}
          isBulkImporting={bulkImportMut.isPending}
          search={search}
          categoryFilter={categoryFilter}
          onOpenCreateDialog={() => setCreateDialogOpen(true)}
        />
      )}

      {/* Dialog for creating a new Master Catalog item */}
      <CreateCatalogItemDialog
        projectId={projectId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          utils.materialCatalog.list.invalidate();
          utils.material.list.invalidate();
        }}
      />

      {/* Dialog for editing an existing Master Catalog item */}
      {editingItem && (
        <EditCatalogItemDialog
          item={editingItem}
          open={Boolean(editingItem)}
          onOpenChange={(open) => !open && setEditingItem(null)}
          onSuccess={() => {
            utils.materialCatalog.list.invalidate();
            utils.material.list.invalidate();
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}
