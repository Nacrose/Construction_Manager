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
  AlertTriangle,
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

  const targetScope = isProjectScoped ? "project" : "org";
  const sourceScope = isProjectScoped ? "org" : "global";

  // 1. Data query
  const previewQuery = trpc.catalogV2.previewImport.useQuery(
    {
      targetScope,
      targetProjectId: projectId,
      sourceScope,
    },
    {
      enabled: open,
      staleTime: 0,
      refetchOnMount: "always",
    }
  );

  // 2. Mutation
  const importMut = trpc.catalogV2.importFromParent.useMutation({
    onSuccess: (res) => {
      utils.catalogV2.listMaterials.invalidate();
      utils.catalogV2.previewImport.invalidate();
      if (projectId) {
        utils.material.list.invalidate({ projectId });
      }
      toast.success(
        `Successfully imported ${res.importedMaterials} materials${res.importedRates ? ` and ${res.importedRates} rates` : ""}!`
      );
      onOpenChange(false);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const previewData = previewQuery.data;
  const isLoading = previewQuery.isLoading;

  const allItems = useMemo(() => {
    if (!previewData) return [];
    const newItems = (previewData.newMaterials || []).map((m: any) => ({
      ...m,
      alreadySynced: false,
    }));
    const existing = (previewData.existingMaterials || []).map((e: any) => ({
      ...e.source,
      alreadySynced: true,
    }));
    return [...newItems, ...existing];
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
    importMut.mutate({
      targetScope,
      targetProjectId: projectId,
      sourceScope,
      materialIds: ids,
    });
  };

  const newItemCount = allItems.filter((i: any) => !i.alreadySynced).length;
  const isPending = importMut.isPending;

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
        ) : previewQuery.isError ? (
          <div className="text-center py-12 space-y-2 text-destructive">
            <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" />
            <p className="font-semibold text-sm">Failed to load sync items</p>
            <p className="text-xs text-muted-foreground">{previewQuery.error?.message || "An unexpected error occurred."}</p>
            <Button size="sm" variant="outline" onClick={() => previewQuery.refetch()} className="text-xs mt-2">
              Retry
            </Button>
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
                  <Badge className="bg-info/10 text-info dark:text-info/80 border-info/40/30 text-[10px] font-medium">
                    {selectedIds.size} Selected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={selectAllNew}
                  disabled={newItemCount === 0}
                >
                  Select All New ({newItemCount})
                </Button>
                {selectedIds.size > 0 && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearAll}>
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search items to sync..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto max-h-[45vh] border rounded-md divide-y divide-border/60 text-xs">
              {Object.entries(treeData).map(([category, groups]: [string, any]) => {
                const catItems = Object.values(groups).flat() as any[];
                const isCatCollapsed = !!collapsedCats[category];
                const catNew = catItems.filter((i) => !i.alreadySynced);
                const allCatSelected = catNew.length > 0 && catNew.every((i) => selectedIds.has(i.id));

                return (
                  <div key={category} className="bg-card">
                    {/* Category Header */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 hover:bg-muted/60 font-semibold select-none cursor-pointer">
                      <div
                        className="flex items-center gap-1.5 flex-1"
                        onClick={() =>
                          setCollapsedCats((p) => ({ ...p, [category]: !p[category] }))
                        }
                      >
                        {isCatCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <Folder className="h-3.5 w-3.5 text-amber-500" />
                        <span>{category}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          ({catItems.length})
                        </span>
                      </div>
                      {catNew.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCategory(catItems);
                          }}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded border transition-colors",
                            allCatSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:border-primary"
                          )}
                        >
                          {allCatSelected ? "Deselect" : "Select Category"}
                        </button>
                      )}
                    </div>

                    {/* Groups */}
                    {!isCatCollapsed &&
                      Object.entries(groups).map(([grpName, items]: [string, any]) => {
                        const grpKey = `${category}::${grpName}`;
                        const isGrpCollapsed = !!collapsedGroups[grpKey];
                        const grpNew = items.filter((i: any) => !i.alreadySynced);
                        const allGrpSelected =
                          grpNew.length > 0 && grpNew.every((i: any) => selectedIds.has(i.id));

                        return (
                          <div key={grpName} className="pl-4 border-t border-border/30">
                            <div className="flex items-center justify-between px-3 py-1 bg-muted/20 hover:bg-muted/30 select-none cursor-pointer">
                              <div
                                className="flex items-center gap-1.5 flex-1"
                                onClick={() =>
                                  setCollapsedGroups((p) => ({
                                    ...p,
                                    [grpKey]: !p[grpKey],
                                  }))
                                }
                              >
                                {isGrpCollapsed ? (
                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                )}
                                <span className="font-medium text-foreground">{grpName}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  ({items.length})
                                </span>
                              </div>
                              {grpNew.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroup(items);
                                  }}
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                                    allGrpSelected
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-background text-muted-foreground border-border hover:border-primary"
                                  )}
                                >
                                  {allGrpSelected ? "Deselect" : "Select Group"}
                                </button>
                              )}
                            </div>

                            {!isGrpCollapsed &&
                              items.map((item: any) => {
                                const isSelected = selectedIds.has(item.id);
                                return (
                                  <div
                                    key={item.id}
                                    onClick={() => !item.alreadySynced && toggleItem(item.id)}
                                    className={cn(
                                      "flex items-center justify-between px-4 py-1.5 pl-8 transition-colors select-none",
                                      item.alreadySynced
                                        ? "opacity-60 cursor-default bg-emerald-50/40 dark:bg-emerald-950/10"
                                        : isSelected
                                        ? "bg-primary/10 cursor-pointer"
                                        : "hover:bg-muted/40 cursor-pointer"
                                    )}
                                  >
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={item.alreadySynced || isSelected}
                                        disabled={item.alreadySynced}
                                        onChange={() => {}}
                                        className="h-3.5 w-3.5 rounded border-muted-foreground text-primary focus:ring-0"
                                      />
                                      <span
                                        className={cn(
                                          item.alreadySynced &&
                                            "text-muted-foreground line-through decoration-emerald-500/50"
                                        )}
                                      >
                                        {item.subCategory ? (
                                          <>
                                            <span className="font-medium">{item.name}</span>{" "}
                                            <span className="text-muted-foreground">
                                              ({item.subCategory})
                                            </span>
                                          </>
                                        ) : (
                                          <span className="font-medium">{item.name}</span>
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono text-muted-foreground">
                                        {item.defaultUnit || "unit"}
                                      </span>
                                      {item.alreadySynced ? (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-300"
                                        >
                                          Synced
                                        </Badge>
                                      ) : item.defaultRate > 0 ? (
                                        <span className="text-[10px] font-mono text-foreground font-semibold">
                                          NPR {item.defaultRate.toLocaleString()}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSync}
            disabled={selectedIds.size === 0 || isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Import Selected ({selectedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
