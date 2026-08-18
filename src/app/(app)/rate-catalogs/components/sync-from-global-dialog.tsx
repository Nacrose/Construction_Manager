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
  Globe,
  Check,
  X,
  Download,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SyncFromGlobalButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-8 text-xs gap-1.5 border-amber-500/30 hover:border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 font-medium"
      >
        <Download className="h-3.5 w-3.5" />
        Sync from Global Catalog
      </Button>
      <SyncFromGlobalDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function SyncFromGlobalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const { data, isLoading } = trpc.materialCatalog.previewSyncFromGlobal.useQuery(
    {},
    { enabled: open }
  );

  const syncMut = trpc.materialCatalog.syncFromGlobal.useMutation({
    onSuccess: (res) => {
      utils.materialCatalog.list.invalidate();
      toast.success(res.message);
      onOpenChange(false);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const allItems = data?.items ?? [];
  const categories = data?.categories ?? [];

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return allItems.filter((item) => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.subCategory || "").toLowerCase().includes(q);
      const matchesCat =
        selectedCategories.length === 0 || selectedCategories.includes(item.category || "");
      return matchesSearch && matchesCat;
    });
  }, [allItems, search, selectedCategories]);

  // Group items into 3-Level WBS: Category (L1) -> Group/Name (L2) -> Leaf Spec Items (L3)
  const treeData = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        const cat = item.category || "General";
        const grp = item.name || "Unspecified";
        if (!acc[cat]) acc[cat] = {};
        if (!acc[cat][grp]) acc[cat][grp] = [];
        acc[cat][grp].push(item);
        return acc;
      },
      {} as Record<string, Record<string, typeof allItems>>
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

  const toggleGroup = (grpItems: typeof allItems) => {
    const newItems = grpItems.filter((i) => !i.alreadySynced);
    const allSelected = newItems.length > 0 && newItems.every((i) => selectedIds.has(i.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      newItems.forEach((i) => {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      });
      return next;
    });
  };

  const toggleCategory = (catItems: typeof allItems) => {
    const newItems = catItems.filter((i) => !i.alreadySynced);
    const allSelected = newItems.length > 0 && newItems.every((i) => selectedIds.has(i.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      newItems.forEach((i) => {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      });
      return next;
    });
  };

  const selectAllNew = () => {
    const newIds = allItems.filter((i) => !i.alreadySynced).map((i) => i.id);
    setSelectedIds(new Set(newIds));
  };

  const clearAll = () => setSelectedIds(new Set());

  const toggleCatCollapse = (cat: string) => {
    setCollapsedCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSync = () => {
    if (selectedIds.size === 0) return;
    syncMut.mutate({ catalogItemIds: Array.from(selectedIds) });
  };

  const newItemCount = allItems.filter((i) => !i.alreadySynced).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Download className="h-5 w-5 text-amber-500" />
            Sync from Global Material Catalog
          </DialogTitle>
          <DialogDescription className="text-xs">
            Select categories, sub-category groups, or individual specifications from the global
            catalog to add to your organization catalog. Already synced items are shown in green and
            cannot be re-selected.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : allItems.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No items in the global catalog yet.</p>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="flex items-center gap-3 py-1">
              <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 border-emerald-300/30 text-[10px] font-medium">
                <Check className="h-3 w-3 mr-1" />
                {data?.alreadySynced ?? 0} Already Synced
              </Badge>
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/30 text-[10px] font-medium">
                <RefreshCw className="h-3 w-3 mr-1" />
                {newItemCount} New Available
              </Badge>
              {selectedIds.size > 0 && (
                <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300/30 text-[10px] font-medium">
                  {selectedIds.size} Selected
                </Badge>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or spec..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={selectAllNew}
                className="h-8 text-xs shrink-0"
                disabled={newItemCount === 0}
              >
                Select All New ({newItemCount})
              </Button>
              {selectedIds.size > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAll}
                  className="h-8 text-xs text-muted-foreground shrink-0"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {/* Category Filter Pills */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedCategories([])}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border transition-colors font-medium",
                    selectedCategories.length === 0
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-transparent text-muted-foreground border-border hover:border-amber-400"
                  )}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setSelectedCategories((prev) =>
                        prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                      )
                    }
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full border transition-colors font-medium",
                      selectedCategories.includes(cat)
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-transparent text-muted-foreground border-border hover:border-amber-400"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* 3-Level WBS Tree View */}
            <div className="flex-1 overflow-y-auto space-y-[3px] min-h-0">
              {Object.entries(treeData).map(([cat, groups]) => {
                const allCatItems = Object.values(groups).flat();
                const newInCat = allCatItems.filter((i) => !i.alreadySynced);
                const selectedInCat = newInCat.filter((i) => selectedIds.has(i.id));
                const allCatSelected =
                  newInCat.length > 0 && selectedInCat.length === newInCat.length;
                const isCatCollapsed = collapsedCats[cat];

                return (
                  <div key={cat} className="rounded-lg overflow-hidden border border-border/50">
                    {/* LEVEL 1 Header: Category */}
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/40 dark:bg-zinc-800/70 cursor-pointer select-none"
                      onClick={() => toggleCatCollapse(cat)}
                    >
                      {isCatCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <input
                        type="checkbox"
                        checked={allCatSelected}
                        onChange={() => toggleCategory(allCatItems)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer"
                        disabled={newInCat.length === 0}
                      />
                      <FolderOpen className="h-3.5 w-3.5 text-amber-500 fill-amber-400/30 shrink-0" />
                      <span className="font-semibold text-xs text-foreground flex-1 truncate">
                        {cat}
                      </span>
                      <Badge variant="outline" className="text-[9px] shrink-0 bg-transparent">
                        {selectedInCat.length}/{newInCat.length} new ·{" "}
                        {allCatItems.length - newInCat.length} synced
                      </Badge>
                    </div>

                    {/* LEVEL 2 & 3 */}
                    {!isCatCollapsed && (
                      <div className="p-1 space-y-[2px] bg-card/40">
                        {Object.entries(groups).map(([grpName, grpItems]) => {
                          const grpKey = `${cat}::${grpName}`;
                          const isGrpCollapsed = collapsedGroups[grpKey];
                          const newInGrp = grpItems.filter((i) => !i.alreadySynced);
                          const selectedInGrp = newInGrp.filter((i) => selectedIds.has(i.id));
                          const allGrpSelected =
                            newInGrp.length > 0 && selectedInGrp.length === newInGrp.length;

                          return (
                            <div
                              key={grpKey}
                              className="rounded-md border border-border/30 overflow-hidden ml-3"
                            >
                              {/* LEVEL 2 Header: Sub-Category / Group */}
                              <div
                                className="flex items-center gap-2 px-2.5 py-1 bg-slate-700/20 dark:bg-zinc-800/40 cursor-pointer select-none"
                                onClick={() => toggleGroupCollapse(grpKey)}
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
                                  className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer"
                                  disabled={newInGrp.length === 0}
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

                              {/* LEVEL 3 Rows: Leaf Specifications */}
                              {!isGrpCollapsed && (
                                <div className="divide-y divide-border/30 bg-background/50 pl-3">
                                  {grpItems.map((item) => {
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
                                        onClick={() => !item.alreadySynced && toggleItem(item.id)}
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
                                            <Check className="h-2.5 w-2.5 mr-0.5" />
                                            Synced
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
              {Object.keys(treeData).length === 0 && (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No items match your filter.
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSync}
            disabled={selectedIds.size === 0 || syncMut.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5"
          >
            {syncMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Sync {selectedIds.size > 0 ? `${selectedIds.size} Items` : "Selected Items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
