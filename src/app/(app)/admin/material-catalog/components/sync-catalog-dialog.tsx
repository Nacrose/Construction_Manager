"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Folder,
  Globe,
  Loader2,
  Download,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SyncCatalogDialog({
  open,
  onOpenChange,
  isOrgScoped = false,
  isProjectScoped = false,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOrgScoped?: boolean;
  isProjectScoped?: boolean;
  projectId?: string;
}) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // 1. Data queries
  const orgPreview = trpc.materialCatalog.previewSyncFromGlobal.useQuery(
    {},
    {
      enabled: open && isOrgScoped,
    }
  );

  const projectPreview = trpc.materialCatalog.previewSyncToProject.useQuery(
    { projectId: projectId || "" },
    { enabled: open && isProjectScoped && !!projectId }
  );

  // 2. Mutations
  const syncFromGlobalMut = trpc.materialCatalog.syncFromGlobal.useMutation({
    onSuccess: (res) => {
      utils.materialCatalog.previewSyncFromGlobal.invalidate({});
      utils.materialCatalog.list.invalidate();
      toast.success(res.message || `Successfully synced ${res.synced} items!`);
      onOpenChange(false);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkImportToProjectMut = trpc.materialCatalog.bulkImportToProject.useMutation({
    onSuccess: (res) => {
      if (projectId) {
        utils.material.list.invalidate({ projectId });
        utils.materialCatalog.previewSyncToProject.invalidate({ projectId });
      }
      utils.materialCatalog.list.invalidate();
      toast.success(res.message || `Successfully added ${res.count} items to project catalog!`);
      onOpenChange(false);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const previewData = isOrgScoped ? orgPreview.data : projectPreview.data;
  const isLoading = isOrgScoped ? orgPreview.isLoading : projectPreview.isLoading;

  const allItems = useMemo(() => {
    return (previewData?.items || []).map((i: any) => ({
      ...i,
      alreadySynced: !!i.alreadySynced,
    }));
  }, [previewData]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(
      (i: any) =>
        i.name.toLowerCase().includes(q) ||
        (i.subCategory && i.subCategory.toLowerCase().includes(q)) ||
        (i.category && i.category.toLowerCase().includes(q))
    );
  }, [allItems, search]);

  const treeData = useMemo(() => {
    return filteredItems.reduce((acc: any, item: any) => {
      const cat = item.category || "General";
      const grp = item.name || "Unspecified";
      if (!acc[cat]) acc[cat] = {};
      if (!acc[cat][grp]) acc[cat][grp] = [];
      acc[cat][grp].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (grpItems: any[]) => {
    const newInGrp = grpItems.filter((i: any) => !i.alreadySynced);
    const allSelected = newInGrp.every((i: any) => selectedIds.has(i.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      newInGrp.forEach((i: any) => {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      });
      return next;
    });
  };

  const toggleCategory = (catItems: any[]) => {
    const newInCat = catItems.filter((i: any) => !i.alreadySynced);
    const allSelected = newInCat.every((i: any) => selectedIds.has(i.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      newInCat.forEach((i: any) => {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      });
      return next;
    });
  };

  const selectAllNew = () => {
    const newIds = allItems.filter((i: any) => !i.alreadySynced).map((i: any) => i.id);
    setSelectedIds(new Set(newIds));
  };

  const clearAll = () => setSelectedIds(new Set());

  const handleSync = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (isOrgScoped) {
      syncFromGlobalMut.mutate({ catalogItemIds: ids });
    } else if (isProjectScoped && projectId) {
      bulkImportToProjectMut.mutate({ projectId, catalogItemIds: ids });
    }
  };

  const newItemCount = allItems.filter((i: any) => !i.alreadySynced).length;
  const isPending = syncFromGlobalMut.isPending || bulkImportToProjectMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Download className="h-5 w-5 text-amber-500" />
            {isProjectScoped ? "Sync from Organization Catalog" : "Sync from Global Catalog"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isProjectScoped
              ? "Select items from the organization catalog to import into this project's catalog."
              : "Select items from the global catalog to add to your organization catalog."}{" "}
            Already synced items are shown in green.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : allItems.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No items available to sync.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 py-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 border-emerald-300/30 text-[10px] font-medium">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {allItems.length - newItemCount} Already Synced
                </Badge>
                <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/30 text-[10px] font-medium">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  {newItemCount} Available
                </Badge>
                {selectedIds.size > 0 && (
                  <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300/30 text-[10px] font-medium">
                    {selectedIds.size} Selected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={selectAllNew}
                  disabled={newItemCount === 0}
                >
                  Select All Available ({newItemCount})
                </Button>
                {selectedIds.size > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-muted-foreground"
                    onClick={clearAll}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="relative my-1">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by material name or specification..."
                className="pl-8 h-8 text-xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-1 max-h-[50vh]">
              {Object.entries(treeData).map(([category, groups]: [string, any]) => {
                const catItems = Object.values(groups).flat() as any[];
                const newInCat = catItems.filter((i) => !i.alreadySynced);
                const selectedInCat = newInCat.filter((i) => selectedIds.has(i.id));
                const allCatSelected =
                  newInCat.length > 0 && selectedInCat.length === newInCat.length;
                const isCatCollapsed = collapsedCats[category];

                return (
                  <div
                    key={category}
                    className="rounded-lg border border-border/50 overflow-hidden"
                  >
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 dark:bg-zinc-900 cursor-pointer select-none"
                      onClick={() =>
                        setCollapsedCats((prev) => ({
                          ...prev,
                          [category]: !prev[category],
                        }))
                      }
                    >
                      {isCatCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <input
                        type="checkbox"
                        checked={allCatSelected}
                        onChange={() => toggleCategory(catItems)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={newInCat.length === 0}
                        className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span className="font-semibold text-xs text-foreground flex-1 truncate">
                        {category}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                        {catItems.length} items
                      </Badge>
                    </div>

                    {!isCatCollapsed && (
                      <div className="p-1.5 space-y-1.5 bg-background">
                        {Object.entries(groups).map(([grpName, grpItems]: [string, any]) => {
                          const grpKey = `${category}::${grpName}`;
                          const isGrpCollapsed = collapsedGroups[grpKey];
                          const newInGrp = grpItems.filter((i: any) => !i.alreadySynced);
                          const selectedInGrp = newInGrp.filter((i: any) =>
                            selectedIds.has(i.id)
                          );
                          const allGrpSelected =
                            newInGrp.length > 0 &&
                            selectedInGrp.length === newInGrp.length;

                          return (
                            <div
                              key={grpKey}
                              className="rounded-md border border-border/30 overflow-hidden ml-3"
                            >
                              <div
                                className="flex items-center gap-2 px-2.5 py-1 bg-slate-700/10 dark:bg-zinc-800/40 cursor-pointer select-none"
                                onClick={() =>
                                  setCollapsedGroups((prev) => ({
                                    ...prev,
                                    [grpKey]: !prev[grpKey],
                                  }))
                                }
                              >
                                {isGrpCollapsed ? (
                                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-amber-500 shrink-0" />
                                )}
                                <input
                                  type="checkbox"
                                  checked={allGrpSelected}
                                  onChange={() => toggleGroup(grpItems)}
                                  onClick={(e) => e.stopPropagation()}
                                  disabled={newInGrp.length === 0}
                                  className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer"
                                />
                                <Folder className="h-3 w-3 text-amber-500/80 shrink-0" />
                                <span className="font-medium text-xs text-foreground flex-1 truncate">
                                  {grpName}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] font-mono shrink-0 bg-transparent text-muted-foreground"
                                >
                                  {grpItems.length} specs
                                </Badge>
                              </div>

                              {!isGrpCollapsed && (
                                <div className="divide-y divide-border/30 bg-background/50 pl-3">
                                  {grpItems.map((item: any) => {
                                    const specText = item.subCategory || item.name;
                                    const isSelected =
                                      item.alreadySynced || selectedIds.has(item.id);

                                    return (
                                      <div
                                        key={item.id}
                                        className={cn(
                                          "flex items-center gap-2.5 px-3 py-1 text-xs transition-colors",
                                          item.alreadySynced
                                            ? "bg-emerald-500/5 text-muted-foreground"
                                            : selectedIds.has(item.id)
                                              ? "bg-amber-500/8 dark:bg-amber-950/20"
                                              : "hover:bg-muted/30 cursor-pointer"
                                        )}
                                        onClick={() =>
                                          !item.alreadySynced && toggleItem(item.id)
                                        }
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() =>
                                            !item.alreadySynced && toggleItem(item.id)
                                          }
                                          onClick={(e) => e.stopPropagation()}
                                          disabled={item.alreadySynced}
                                          className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                        />
                                        <span className="flex-1 font-mono text-xs text-foreground truncate">
                                          {specText}
                                        </span>
                                        <span className="text-muted-foreground font-mono text-[10px] shrink-0 w-16 text-right">
                                          {item.defaultUnit || "unit"}
                                        </span>
                                        {item.alreadySynced && (
                                          <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-[9px] border-0 px-1.5 shrink-0">
                                            <CheckCircle2 className="h-3 w-3 mr-0.5" /> Synced
                                          </Badge>
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
                    )}
                  </div>
                );
              })}
            </div>

            <DialogFooter className="pt-2 gap-2 border-t">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSync}
                disabled={selectedIds.size === 0 || isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium gap-1.5"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Sync {selectedIds.size > 0 ? `${selectedIds.size} Selected` : "Items"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
