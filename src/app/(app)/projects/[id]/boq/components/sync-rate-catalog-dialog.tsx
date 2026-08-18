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
  Loader2,
  Trash2,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  RefreshCw,
  Download,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SyncRateCatalogDialog({
  open,
  onOpenChange,
  catalogId,
  onSynced,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogId: string;
  onSynced: () => void;
}) {
  const utils = trpc.useUtils();
  const [syncTab, setSyncTab] = useState<"add" | "prune">("add");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedPruneIds, setSelectedPruneIds] = useState<Set<string>>(new Set());
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  const { data, isLoading } = trpc.rateCatalog.previewSync.useQuery(
    { catalogId },
    { enabled: open && !!catalogId }
  );

  const syncMut = trpc.rateCatalog.syncWithMaterialCatalog.useMutation({
    onSuccess: (data) => {
      onSynced();
      utils.rateCatalog.previewSync.invalidate({ catalogId });
      toast.success(
        `Synced! Added ${data.addedCount} items, removed ${data.removedCount} orphans${data.ratesInherited > 0 ? `, inherited ${data.ratesInherited} district rates from parent catalog` : ""}.`
      );
      onOpenChange(false);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const pruneMut = trpc.rateCatalog.pruneOrphanedItems.useMutation({
    onSuccess: (res) => {
      onSynced();
      utils.rateCatalog.previewSync.invalidate({ catalogId });
      toast.success(res.message);
      setSelectedPruneIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const allItems = data?.items ?? [];
  const pendingItems = allItems.filter((i) => !i.alreadySynced);
  const orphanedItems = data?.orphanedItems ?? [];

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return allItems.filter(
      (item) =>
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.subCategory || "").toLowerCase().includes(q)
    );
  }, [allItems, search]);

  const filteredOrphanedItems = useMemo(() => {
    const q = search.toLowerCase();
    return orphanedItems.filter(
      (item) =>
        !q || item.materialName.toLowerCase().includes(q) || String(item.code).includes(q)
    );
  }, [orphanedItems, search]);

  const treeData = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        const cat = item.category || "General";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
      },
      {} as Record<string, typeof allItems>
    );
  }, [filteredItems]);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePruneItem = (id: string) => {
    setSelectedPruneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllSafePrune = () => {
    const safeIds = orphanedItems.filter((i) => !i.isUsedInBoq).map((i) => i.id);
    setSelectedPruneIds(new Set(safeIds));
  };

  const toggleCatItems = (catItems: typeof allItems) => {
    const availableInCat = catItems.filter((i) => !i.alreadySynced);
    const allSelected =
      availableInCat.length > 0 && availableInCat.every((i) => selectedIds.has(i.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      availableInCat.forEach((i) => {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      });
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-amber-500" />
            Sync & Prune Rate Catalog
          </DialogTitle>
          <DialogDescription className="text-xs">
            Review missing materials to import or clean up materials that were deleted/archived from
            the Material Catalog.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-border/80 pb-2">
          <button
            type="button"
            onClick={() => {
              setSyncTab("add");
              setSearch("");
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              syncTab === "add"
                ? "bg-amber-600 text-white shadow-2xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            <Download className="h-3.5 w-3.5" />
            Pull Missing Materials
            {data && data.pendingCount > 0 && (
              <Badge className="bg-amber-500/30 text-white text-[10px] px-1.5 py-0 font-mono">
                {data.pendingCount}
              </Badge>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setSyncTab("prune");
              setSearch("");
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              syncTab === "prune"
                ? "bg-red-600 text-white shadow-2xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clean Up Deleted Materials
            {data && data.orphanedCount > 0 && (
              <Badge className="bg-red-500/30 text-white text-[10px] px-1.5 py-0 font-mono">
                {data.orphanedCount}
              </Badge>
            )}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : syncTab === "add" ? (
          <>
            <div className="flex items-center justify-between gap-3 py-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 border-emerald-300/30 text-[10px] font-medium">
                  <Check className="h-3 w-3 mr-1" />
                  {data?.alreadySyncedCount ?? 0} In Rate Catalog
                </Badge>
                <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/30 text-[10px] font-medium">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  {data?.pendingCount ?? 0} Available to Add
                </Badge>
                {selectedIds.size > 0 && (
                  <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300/30 text-[10px] font-medium">
                    {selectedIds.size} Selected
                  </Badge>
                )}
              </div>
            </div>

            <div className="relative my-1">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search materials to add..."
                className="pl-8 h-8 text-xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-1 max-h-[48vh]">
              {Object.keys(treeData).length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-xs">
                  <Check className="h-8 w-8 mx-auto text-emerald-500/40 mb-2" />
                  All material catalog items are already present in this rate catalog.
                </div>
              ) : (
                Object.entries(treeData).map(([cat, items]: [string, any]) => {
                  const availableInCat = items.filter((i: any) => !i.alreadySynced);
                  const selectedInCat = availableInCat.filter((i: any) => selectedIds.has(i.id));
                  const allCatSelected =
                    availableInCat.length > 0 &&
                    selectedInCat.length === availableInCat.length;
                  const isCatCollapsed = collapsedCats[cat];

                  return (
                    <div key={cat} className="rounded-lg overflow-hidden border border-border/50">
                      <div
                        onClick={() =>
                          setCollapsedCats((prev) => ({ ...prev, [cat]: !prev[cat] }))
                        }
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/40 dark:bg-zinc-800/70 cursor-pointer select-none"
                      >
                        {isCatCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        )}
                        <input
                          type="checkbox"
                          checked={allCatSelected}
                          onChange={() => toggleCatItems(items)}
                          onClick={(e) => e.stopPropagation()}
                          disabled={availableInCat.length === 0}
                          className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-30"
                        />
                        <FolderOpen className="h-3.5 w-3.5 text-amber-500 fill-amber-400/30 shrink-0" />
                        <span className="font-semibold text-xs text-foreground flex-1 truncate">
                          {cat}
                        </span>
                        <Badge variant="outline" className="text-[9px] shrink-0 bg-transparent">
                          {availableInCat.length > 0 && (
                            <span className="text-amber-600">
                              {availableInCat.length} available
                            </span>
                          )}
                          {availableInCat.length > 0 &&
                            items.length - availableInCat.length > 0 && (
                              <span className="text-muted-foreground"> · </span>
                            )}
                          {items.length - availableInCat.length > 0 && (
                            <span className="text-emerald-600">
                              {items.length - availableInCat.length} in catalog
                            </span>
                          )}
                        </Badge>
                      </div>

                      {!isCatCollapsed && (
                        <div className="divide-y divide-border/40">
                          {items.map((item: any) => {
                            const isSynced = item.alreadySynced;
                            const isSelected = selectedIds.has(item.id);
                            return (
                              <div
                                key={item.id}
                                className={cn(
                                  "flex items-center gap-2.5 px-4 py-1.5 text-xs transition-colors",
                                  isSynced
                                    ? "bg-emerald-500/5"
                                    : isSelected
                                      ? "bg-amber-500/8"
                                      : "hover:bg-muted/30 cursor-pointer"
                                )}
                                onClick={() => !isSynced && toggleItem(item.id)}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSynced || isSelected}
                                  onChange={() => !isSynced && toggleItem(item.id)}
                                  disabled={isSynced}
                                  className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                />
                                <span className="flex-1 font-medium text-foreground truncate">
                                  {item.name}
                                  {item.subCategory && (
                                    <span className="text-muted-foreground ml-1">
                                      — {item.subCategory}
                                    </span>
                                  )}
                                </span>
                                <span className="text-muted-foreground font-mono text-[10px] shrink-0">
                                  {item.unit}
                                </span>
                                {isSynced && (
                                  <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-[9px] border-0 px-1.5 shrink-0">
                                    <Check className="h-2.5 w-2.5 mr-0.5" />
                                    In Catalog
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <DialogFooter className="pt-2 border-t gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMut.mutate({ catalogId })}
                disabled={syncMut.isPending}
                className="h-8 text-xs text-muted-foreground"
                title="Perform full auto-sync: adds missing items, inherits parent rates, and deletes orphans"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5 mr-1", syncMut.isPending && "animate-spin")}
                />
                Full Auto Sync
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  syncMut.mutate({
                    catalogId,
                    selectedMaterialIds:
                      selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
                  })
                }
                disabled={
                  syncMut.isPending || (pendingItems.length === 0 && selectedIds.size === 0)
                }
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5 h-8"
              >
                {syncMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {selectedIds.size > 0
                  ? `Add Selected (${selectedIds.size})`
                  : "Sync All Available"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* Prune Tab */
          <>
            <div className="flex items-center justify-between gap-3 py-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-300/30 text-[10px] font-medium">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {data?.orphanedCount ?? 0} Deleted / Inactive in Material Catalog
                </Badge>
                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300/30 text-[10px] font-medium">
                  {data?.safeToPruneCount ?? 0} Safe to Remove
                </Badge>
                {selectedPruneIds.size > 0 && (
                  <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300/30 text-[10px] font-medium">
                    {selectedPruneIds.size} Selected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={selectAllSafePrune}
                  disabled={(data?.safeToPruneCount ?? 0) === 0}
                >
                  Select Safe ({data?.safeToPruneCount ?? 0})
                </Button>
                {selectedPruneIds.size > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-muted-foreground"
                    onClick={() => setSelectedPruneIds(new Set())}
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
                placeholder="Search deleted rate items to prune..."
                className="pl-8 h-8 text-xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 my-1 max-h-[48vh]">
              {filteredOrphanedItems.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-xs">
                  <Check className="h-8 w-8 mx-auto text-emerald-500/40 mb-2" />
                  No deleted or orphaned materials found in this rate catalog. All items match
                  active materials.
                </div>
              ) : (
                <div className="border border-border/60 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left table-fixed">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-muted-foreground text-[11px]">
                        <th className="py-2 px-2.5 w-10 text-center"></th>
                        <th className="py-2 px-2 w-14 font-semibold font-mono text-center">SN</th>
                        <th className="py-2 px-2.5 font-semibold">
                          Material Name in Rate Catalog
                        </th>
                        <th className="py-2 px-2 w-20 font-semibold">Unit</th>
                        <th className="py-2 px-2 w-24 font-semibold text-center">Districts</th>
                        <th className="py-2 px-2.5 w-36 font-semibold text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filteredOrphanedItems.map((item) => {
                        const isSelected = selectedPruneIds.has(item.id);
                        return (
                          <tr
                            key={item.id}
                            className={cn(
                              "transition-colors",
                              item.isUsedInBoq
                                ? "bg-muted/10 opacity-80"
                                : isSelected
                                  ? "bg-red-500/10"
                                  : "hover:bg-muted/20 cursor-pointer"
                            )}
                            onClick={() => !item.isUsedInBoq && togglePruneItem(item.id)}
                          >
                            <td className="py-2 px-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() =>
                                  !item.isUsedInBoq && togglePruneItem(item.id)
                                }
                                disabled={item.isUsedInBoq}
                                className="rounded border-zinc-300 text-red-600 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="py-2 px-2 text-center font-mono text-muted-foreground text-[11px]">
                              {item.code}
                            </td>
                            <td className="py-2 px-2.5 font-medium text-foreground truncate">
                              {item.materialName}
                            </td>
                            <td className="py-2 px-2 font-mono text-muted-foreground">
                              {item.unit}
                            </td>
                            <td className="py-2 px-2 text-center text-muted-foreground font-mono text-[11px]">
                              {item.ratesCount} dist.
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {item.isUsedInBoq ? (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-300"
                                >
                                  <Shield className="h-2.5 w-2.5 mr-0.5" /> Used in BOQs
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                                >
                                  <Check className="h-2.5 w-2.5 mr-0.5" /> Safe to Remove
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2 border-t gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => pruneMut.mutate({ catalogId, pruneAllSafe: true })}
                disabled={pruneMut.isPending || (data?.safeToPruneCount ?? 0) === 0}
                className="h-8 text-xs border-red-300 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                title="1-Click clean up all orphaned materials that have 0 BOQ references"
              >
                {pruneMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                )}
                Prune All Unused ({data?.safeToPruneCount ?? 0})
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  pruneMut.mutate({
                    catalogId,
                    itemIds: Array.from(selectedPruneIds),
                  })
                }
                disabled={pruneMut.isPending || selectedPruneIds.size === 0}
                className="text-xs gap-1.5 h-8 font-medium"
              >
                {pruneMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Prune Selected ({selectedPruneIds.size})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
