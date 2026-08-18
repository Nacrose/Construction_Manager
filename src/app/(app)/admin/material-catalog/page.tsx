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

export default function AdminMaterialCatalogPage({
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

  const catalogQuery = trpc.materialCatalog.list.useQuery(
    { includeGlobal: !isOrgScoped && !isProjectScoped, search: search.trim() || undefined, limit: 1000, showArchived },
    { enabled: !isProjectScoped }
  );

  const archivedQuery = trpc.materialCatalog.listArchived.useQuery(
    { search: search.trim() || undefined },
    { enabled: showArchived && !isProjectScoped }
  );

  const projectMaterialsQuery = trpc.material.list.useQuery(
    { projectId: projectId || "" },
    { enabled: !!projectId }
  );

  const projectCatalogIdSet = useMemo(() => {
    const set = new Set<string>();
    if (projectMaterialsQuery.data?.materials) {
      for (const m of projectMaterialsQuery.data.materials) {
        if (m.materialCatalogId) set.add(m.materialCatalogId);
      }
    }
    return set;
  }, [projectMaterialsQuery.data]);

  const isLoading = isProjectScoped ? projectMaterialsQuery.isLoading : catalogQuery.isLoading;

  const rawItems = useMemo(() => {
    if (isProjectScoped) {
      return (projectMaterialsQuery.data?.materials || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        category: m.category || "General",
        subCategory: m.subCategory || null,
        defaultUnit: m.unit || "unit",
        defaultRate: m.rate || 0,
        rateSource: m.reference || null,
        isGlobal: false,
        organizationId: null,
        projectId: m.projectId,
      }));
    }
    return catalogQuery.data?.items || [];
  }, [isProjectScoped, projectMaterialsQuery.data, catalogQuery.data]);

  const items = rawItems;
  const createCatalogMut = trpc.materialCatalog.create.useMutation();

  const restoreCatalogMut = trpc.materialCatalog.restore.useMutation({
    onSuccess: (res) => {
      utils.materialCatalog.list.invalidate();
      utils.materialCatalog.listArchived.invalidate();
      toast.success(`Restored "${res.item.name}" to catalog`);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteByCategoryMut = trpc.materialCatalog.deleteByCategory.useMutation({
    onSuccess: (res, vars) => {
      utils.materialCatalog.list.invalidate();
      utils.materialCatalog.listArchived.invalidate();
      const msg = res.hardDeleted
        ? `Archived ${res.archived} item(s), permanently deleted ${res.hardDeleted} unused item(s) in "${vars.category}"`
        : `Archived ${res.archived} item(s) in "${vars.category}". Restore from Archived view if needed.`;
      toast.success(msg);
      setCategoryDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteBySubCategoryMut = trpc.materialCatalog.deleteBySubCategory.useMutation({
    onSuccess: (res, vars) => {
      utils.materialCatalog.list.invalidate();
      utils.materialCatalog.listArchived.invalidate();
      const msg = res.hardDeleted
        ? `Archived ${res.archived} item(s), permanently deleted ${res.hardDeleted} unused item(s) in "${vars.groupName}"`
        : `Archived ${res.archived} item(s) in "${vars.groupName}". Restore from Archived view if needed.`;
      toast.success(msg);
      setCategoryDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const purgeArchivedMut = trpc.materialCatalog.purgeArchived.useMutation({
    onSuccess: (res) => {
      utils.materialCatalog.list.invalidate();
      utils.materialCatalog.listArchived.invalidate();
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

  const deleteManyCatalogMut = trpc.materialCatalog.deleteMany.useMutation({
    onSuccess: (res) => {
      setSelectedIds(new Set());
      setDeleteConfirmIds([]);
      utils.materialCatalog.list.invalidate();
      utils.materialCatalog.listArchived.invalidate();
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
        utils.materialCatalog.previewSyncToProject.invalidate({ projectId });
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
        name: oldItem.name,
        category: oldItem.category ?? undefined,
        subCategory: oldItem.subCategory ?? undefined,
        defaultUnit: oldItem.defaultUnit ?? undefined,
        defaultRate: oldItem.defaultRate ?? undefined,
        rateSource: oldItem.rateSource ?? undefined,
        organizationId: oldItem.organizationId ?? undefined,
        isGlobal: oldItem.isGlobal ?? !isOrgScoped,
      });
      setDeletedHistoryStack((prev) => prev.filter((h) => h.id !== oldItem.id));
      utils.materialCatalog.list.invalidate();
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
      {/* Top Tab Bar & Actions */}
      {!isProjectScoped && (
        <div className="flex items-center justify-between border-b border-border/80 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("catalog")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                activeTab === "catalog"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {isOrgScoped ? "Organization Catalog" : "Global Master Catalog"}
            </button>
            <button
              onClick={() => setActiveTab("uncataloged")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all relative",
                activeTab === "uncataloged"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Uncataloged Review
              {pendingCount > 0 && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-4 font-mono",
                    activeTab === "uncataloged"
                      ? "bg-primary-foreground text-primary font-bold"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  )}
                >
                  {pendingCount}
                </Badge>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
              className="h-8 text-xs gap-1.5 border-emerald-500/40 hover:border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 font-medium"
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

      {/* View 1: Uncataloged Review Moderation Tab */}
      {activeTab === "uncataloged" && !isProjectScoped ? (
        <UncatalogedReviewTab />
      ) : (
        <>
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
        </>
      )}

      {/* Modals & Dialogs */}
      <SyncCatalogDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        isProjectScoped={isProjectScoped}
        projectId={projectId}
      />
      <CreateGlobalCatalogItemDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          utils.materialCatalog.list.invalidate();
          if (projectId) utils.material.list.invalidate({ projectId });
        }}
        isOrgScoped={isOrgScoped}
        isProjectScoped={isProjectScoped}
        projectId={projectId}
      />
      {editingItem && (
        <EditGlobalCatalogItemDialog
          item={editingItem}
          open={!!editingItem}
          onOpenChange={(open) => !open && setEditingItem(null)}
          onSuccess={() => {
            utils.materialCatalog.list.invalidate();
            if (projectId) utils.material.list.invalidate({ projectId });
          }}
        />
      )}
      <ConfirmCatalogDeleteDialog
        ids={deleteConfirmIds}
        open={deleteConfirmIds.length > 0}
        onOpenChange={(open) => !open && setDeleteConfirmIds([])}
        onConfirm={() => {
          if (isProjectScoped && projectId) {
            deleteManyProjectMaterialMut.mutate({ itemIds: deleteConfirmIds });
          } else {
            deleteManyCatalogMut.mutate({ ids: deleteConfirmIds, force: true });
          }
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
            if (categoryDeleteTarget.groupName) {
              deleteBySubCategoryMut.mutate({
                category: categoryDeleteTarget.category,
                groupName: categoryDeleteTarget.groupName,
                mode: "archive_all",
              });
            } else {
              deleteByCategoryMut.mutate({
                category: categoryDeleteTarget.category,
                mode: "archive_all",
              });
            }
          }}
          onDeleteSafeArchiveRest={() => {
            if (categoryDeleteTarget.groupName) {
              deleteBySubCategoryMut.mutate({
                category: categoryDeleteTarget.category,
                groupName: categoryDeleteTarget.groupName,
                mode: "delete_safe_archive_rest",
              });
            } else {
              deleteByCategoryMut.mutate({
                category: categoryDeleteTarget.category,
                mode: "delete_safe_archive_rest",
              });
            }
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
      <MaterialMergeDialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen} />
      <ExcelMaterialImporter open={importDialogOpen} onOpenChange={setImportDialogOpen} />
    </div>
  );
}
