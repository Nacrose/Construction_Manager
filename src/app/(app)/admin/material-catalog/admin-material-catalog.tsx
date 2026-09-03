"use client";

import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, GitMerge, Layers, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UncatalogedReviewTab } from "./components/uncataloged-review-tab";
import { MaterialMergeDialog } from "./components/material-merge-dialog";
import { ExcelMaterialImporter } from "./components/excel-material-importer";
import { SyncCatalogDialog } from "./components/sync-catalog-dialog";
import { CreateGlobalCatalogItemDialog } from "./components/create-global-catalog-item-dialog";
import { EditGlobalCatalogItemDialog } from "./components/edit-global-catalog-item-dialog";
import { ConfirmCatalogDeleteDialog, CategoryDeleteDialog } from "./components/catalog-delete-dialogs";
import { CatalogToolbar } from "./components/catalog-toolbar";
import { CatalogTree } from "./components/catalog-tree";
import { ArchivedCatalogTable } from "./components/archived-catalog-table";
import { PurgeArchivedDialog } from "./components/purge-archived-dialog";

export function AdminMaterialCatalogPage({
  isOrgScoped = false,
  isProjectScoped: propIsProjectScoped = false,
  projectId,
}: {
  isOrgScoped?: boolean;
  isProjectScoped?: boolean;
  projectId?: string;
}) {
  const isProjectScoped = propIsProjectScoped || Boolean(projectId);
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"catalog" | "uncataloged">("catalog");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<{ category: string; groupName?: string } | null>(null);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");

  const uncatalogedStatsQuery = trpc.uncatalogedMaterial.stats.useQuery(
    { level: isOrgScoped ? "org" : "global" },
    { enabled: !isProjectScoped }
  );
  const pendingCount = uncatalogedStatsQuery.data?.pending || 0;

  const [deletedHistoryStack, setDeletedHistoryStack] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const activeScope = isProjectScoped ? "project" : isOrgScoped ? "org" : "global";
  const catalogQuery: any = trpc.catalogV2.listMaterials.useQuery(
    {
      scope: activeScope as any,
      ...(projectId ? { projectId } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      limit: 500,
      activeOnly: !showArchived,
    },
    { enabled: true }
  );

  const archivedQuery: any = trpc.catalogV2.listMaterials.useQuery(
    {
      scope: activeScope as any,
      ...(projectId ? { projectId } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      limit: 500,
      activeOnly: false,
    },
    { enabled: showArchived && !isProjectScoped }
  );

  const projectCatalogIdSet = useMemo(() => {
    // Only relevant for project scope — admin/org should not show Project badge
    if (!isProjectScoped) return new Set<string>();
    const set = new Set<string>();
    const items = (catalogQuery.data as any)?.materials || [];
    for (const m of items) {
      if (m.sourceMaterialId) set.add(m.sourceMaterialId);
    }
    return set;
  }, [catalogQuery.data, isProjectScoped]);

  const isLoading = catalogQuery.isLoading;

  const rawItems = useMemo(() => {
    const mats = (catalogQuery.data as any)?.materials || [];
    return mats
      .filter((m: any) => !showArchived || m.isActive === false)
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        category: m.category || "General",
        subCategory: m.subCategory || null,
        defaultUnit: m.defaultUnit || "unit",
        defaultRate: m.defaultRate || 0,
        rateSource: null,
        isGlobal: m.scope === "global",
        organizationId: m.organizationId || null,
        projectId: m.projectId || null,
        sourceMaterialId: m.sourceMaterialId || null,
        isActive: m.isActive,
        aliases: m.aliases || [],
      }));
  }, [catalogQuery.data, showArchived]);

  const items = rawItems;
  const createCatalogMut = trpc.catalogV2.createMaterial.useMutation();

  const restoreCatalogMut = trpc.catalogV2.updateMaterial.useMutation({
    onSuccess: (_res, vars) => {
      utils.catalogV2.listMaterials.invalidate();
      toast.success(`Restored item`);
    },
    onError: (e) => toast.error(e.message),
  });

  // Legacy category deletes kept until v2 deleteByCategory is added; for now use bulkDelete via ids
  const deleteByCategoryMut = trpc.catalogV2.bulkDeleteMaterials.useMutation({
    onSuccess: (res) => {
      utils.catalogV2.listMaterials.invalidate();
      toast.success(`Archived ${res.archived} / deleted ${res.hardDeleted} item(s)`);
      setCategoryDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteBySubCategoryMut = trpc.catalogV2.bulkDeleteMaterials.useMutation({
    onSuccess: (res) => {
      utils.catalogV2.listMaterials.invalidate();
      toast.success(`Archived ${res.archived} / deleted ${res.hardDeleted} item(s)`);
      setCategoryDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const purgeArchivedMut = trpc.catalogV2.purgeArchived.useMutation({
    onSuccess: (res) => {
      utils.catalogV2.listMaterials.invalidate();
      const skippedMsg = res.skipped > 0 ? ` (${res.skipped} kept — still referenced)` : "";
      toast.success(`Permanently purged ${res.purged} archived item(s)${skippedMsg}`);
      setPurgeDialogOpen(false);
      setPurgeConfirmText("");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteManyCatalogMut = trpc.catalogV2.bulkDeleteMaterials.useMutation({
    onSuccess: (res) => {
      setSelectedIds(new Set());
      setDeleteConfirmIds([]);
      utils.catalogV2.listMaterials.invalidate();
      if (res.mode === "archived") {
        toast.success(`Archived ${res.count} item(s). Restore from the Archived view if needed.`);
      } else if (res.mode === "mixed") {
        toast.success(`Archived ${(res as any).archived ?? 0}, permanently deleted ${(res as any).hardDeleted ?? 0} item(s).`);
      } else {
        toast.success(`Processed ${res.count} item(s).`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteManyProjectMaterialMut = trpc.material.deleteMany.useMutation({
    onSuccess: (res) => {
      setSelectedIds(new Set());
      setDeleteConfirmIds([]);
      if (projectId) {
        utils.material.list.invalidate({ projectId });
        utils.catalogV2.previewImport.invalidate();
      }
      toast.success(`Successfully deleted ${res.count} item(s) from project catalog`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteConfirmIds(Array.from(selectedIds));
  };

  const handleUndoDelete = async (oldItem: any) => {
    try {
      await createCatalogMut.mutateAsync({
        scope: activeScope as any,
        projectId: projectId || undefined,
        name: oldItem.name,
        category: oldItem.category ?? undefined,
        subCategory: oldItem.subCategory ?? undefined,
        defaultUnit: oldItem.defaultUnit ?? undefined,
        defaultRate: oldItem.defaultRate ?? undefined,
      });
      setDeletedHistoryStack((prev) => prev.filter((h) => h.id !== oldItem.id));
      utils.catalogV2.listMaterials.invalidate();
      toast.success(`Restored "${oldItem.name}" to catalog`);
    } catch (e: any) {
      toast.error(e.message || "Failed to restore item");
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        const tag = document.activeElement?.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || document.activeElement?.getAttribute("contenteditable") === "true") {
          return;
        }
        if (deletedHistoryStack.length > 0) {
          e.preventDefault();
          handleUndoDelete(deletedHistoryStack[0]);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deletedHistoryStack]);

  const filteredItems = items.filter((item) => {
    if (categoryFilter !== "all" && (item.category || "General").toLowerCase() !== categoryFilter.toLowerCase()) {
      return false;
    }
    return true;
  });

  const treeData = filteredItems.reduce((acc, item) => {
    const cat = item.category || "General";
    const groupName = item.name || "Unspecified";
    if (!acc[cat]) acc[cat] = {};
    if (!acc[cat][groupName]) acc[cat][groupName] = [];
    acc[cat][groupName].push(item);
    return acc;
  }, {} as Record<string, Record<string, any[]>>);

  const allCategories = Array.from(new Set(items.map((i) => i.category || "General"))) as string[];

  const materialsByCategory = useMemo(() => {
    const map: Record<string, Array<{ name: string; defaultUnit?: string; defaultRate?: number }>> = {};
    for (const item of items) {
      const cat = item.category || "General";
      if (!map[cat]) map[cat] = [];
      if (!map[cat].some((m) => m.name.toLowerCase() === item.name.toLowerCase())) {
        map[cat].push({ name: item.name, defaultUnit: item.defaultUnit, defaultRate: item.defaultRate });
      }
    }
    return map;
  }, [items]);

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

  return (
    <div className="space-y-3">
      {/* Top Header & Fast Actions */}
      {!isProjectScoped && (
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
              <BookOpen className="h-4 w-4 text-amber-500" />
              {isOrgScoped ? "Organization Resource Catalog" : "Global Master Catalog"}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
              className="h-8 text-xs gap-1.5 border-success/40 hover:border-success text-success dark:text-success/80 bg-success dark:bg-success/20 font-medium"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Import & Deduplicate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMergeDialogOpen(true)}
              className="h-8 text-xs gap-1.5 border-amber-500/40 hover:border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20 font-medium"
            >
              <GitMerge className="h-3.5 w-3.5" /> Merge Duplicates
            </Button>
          </div>
        </div>
      )}

      <CatalogToolbar
        search={search}
        setSearch={setSearch}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        allCategories={allCategories}
        handleExpandAll={handleExpandAll}
        handleCollapseAll={handleCollapseAll}
        selectedIds={selectedIds}
        handleBulkDelete={handleBulkDelete}
        deletedHistoryStack={deletedHistoryStack}
        handleUndoDelete={handleUndoDelete}
        isOrgScoped={isOrgScoped}
        isProjectScoped={isProjectScoped}
        setSyncDialogOpen={setSyncDialogOpen}
        setMergeDialogOpen={setMergeDialogOpen}
        showArchived={showArchived}
        setShowArchived={setShowArchived}
        archivedQuery={archivedQuery}
        setCreateDialogOpen={setCreateDialogOpen}
      />

          {showArchived && !isProjectScoped ? (
            <ArchivedCatalogTable
              archivedQuery={archivedQuery}
              restoreCatalogMut={restoreCatalogMut}
              setPurgeDialogOpen={setPurgeDialogOpen}
              setDeleteConfirmIds={setDeleteConfirmIds}
            />
          ) : (
            <CatalogTree
              isLoading={isLoading}
              treeData={treeData}
              isOrgScoped={isOrgScoped}
              isProjectScoped={isProjectScoped}
              collapsedCategories={collapsedCategories}
              collapsedGroups={collapsedGroups}
              toggleCategory={(cat) => setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))}
              toggleGroup={(cat, grp) => {
                const key = `${cat}::${grp}`;
                setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
              }}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
              setCategoryDeleteTarget={setCategoryDeleteTarget}
              setEditingItem={setEditingItem}
              setDeleteConfirmIds={setDeleteConfirmIds}
              setCreateDialogOpen={setCreateDialogOpen}
              projectCatalogIdSet={projectCatalogIdSet}
            />
          )}

      {/* Modals & Dialogs */}
      <SyncCatalogDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        isOrgScoped={isOrgScoped}
        isProjectScoped={isProjectScoped}
        projectId={projectId}
      />
      <CreateGlobalCatalogItemDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          utils.catalogV2.listMaterials.invalidate();
          if (projectId) utils.catalogV2.listMaterials.invalidate();
        }}
        isOrgScoped={isOrgScoped}
        isProjectScoped={isProjectScoped}
        projectId={projectId}
        availableCategories={allCategories}
        existingMaterials={items}
      />
      {editingItem && (
        <EditGlobalCatalogItemDialog
          item={editingItem}
          open={!!editingItem}
          onOpenChange={(open) => !open && setEditingItem(null)}
          onSuccess={() => {
            utils.catalogV2.listMaterials.invalidate();
            if (projectId) utils.catalogV2.listMaterials.invalidate();
          }}
        />
      )}
      <ConfirmCatalogDeleteDialog
        ids={deleteConfirmIds}
        open={deleteConfirmIds.length > 0}
        onOpenChange={(open) => !open && setDeleteConfirmIds([])}
        onConfirm={() => {
          deleteManyCatalogMut.mutate({ ids: deleteConfirmIds, force: true });
        }}
        onArchive={() => {
          deleteManyCatalogMut.mutate({ ids: deleteConfirmIds, force: false });
        }}
      />
      {categoryDeleteTarget && (
        <CategoryDeleteDialog
          open={!!categoryDeleteTarget}
          onOpenChange={(open) => !open && setCategoryDeleteTarget(null)}
          category={categoryDeleteTarget.category}
          groupName={categoryDeleteTarget.groupName}
          isAdmin={!isOrgScoped && !isProjectScoped}
          onArchiveAll={() => {
            const ids = categoryDeleteTarget.groupName
              ? (treeData[categoryDeleteTarget.category]?.[categoryDeleteTarget.groupName] || []).map((i: any) => i.id)
              : Object.values(treeData[categoryDeleteTarget.category] || {}).flat().map((i: any) => i.id);
            deleteByCategoryMut.mutate({ ids, force: false });
          }}
          onDeleteSafeArchiveRest={() => {
            const ids = categoryDeleteTarget.groupName
              ? (treeData[categoryDeleteTarget.category]?.[categoryDeleteTarget.groupName] || []).map((i: any) => i.id)
              : Object.values(treeData[categoryDeleteTarget.category] || {}).flat().map((i: any) => i.id);
            deleteByCategoryMut.mutate({ ids, force: true });
          }}
          isLoading={deleteByCategoryMut.isPending || deleteBySubCategoryMut.isPending}
        />
      )}
      <PurgeArchivedDialog
        open={purgeDialogOpen}
        onOpenChange={setPurgeDialogOpen}
        purgeConfirmText={purgeConfirmText}
        setPurgeConfirmText={setPurgeConfirmText}
        purgeArchivedMut={purgeArchivedMut}
      />
      <MaterialMergeDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        level={isProjectScoped ? "project" : isOrgScoped ? "org" : "global"}
      />
      <ExcelMaterialImporter open={importDialogOpen} onOpenChange={setImportDialogOpen} />
    </div>
  );
}
