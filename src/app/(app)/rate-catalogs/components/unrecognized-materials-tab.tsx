"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2, Check, AlertTriangle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function UnrecognizedBadge() {
  const { data } = trpc.materialCatalog.unrecognizedCount.useQuery({});
  if (!data?.count) return null;
  return (
    <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
      {data.count > 99 ? "99+" : data.count}
    </span>
  );
}

export function UnrecognizedMaterialsTab() {
  const utils = trpc.useUtils();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = trpc.materialCatalog.unrecognizedList.useQuery({});
  const { data: catalogData } = trpc.materialCatalog.list.useQuery({ limit: 1000 });

  const promote = trpc.materialCatalog.unrecognizedPromote.useMutation({
    onSuccess: () => {
      utils.materialCatalog.unrecognizedList.invalidate();
      utils.materialCatalog.unrecognizedCount.invalidate();
      utils.materialCatalog.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteEntry = trpc.materialCatalog.unrecognizedDelete.useMutation({
    onSuccess: () => {
      utils.materialCatalog.unrecognizedList.invalidate();
      utils.materialCatalog.unrecognizedCount.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const catalogItems = catalogData?.items ?? [];

  const getFuzzyMatch = (name: string) => {
    const norm = name.toLowerCase().trim();
    if (!norm) return null;
    return catalogItems.find((item) => {
      const matchNorm = item.name.toLowerCase().trim();
      return (
        matchNorm.includes(norm) ||
        norm.includes(matchNorm) ||
        (item.subCategory && matchNorm.includes(norm.split(" ")[0]))
      );
    });
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleBulkPromote = async () => {
    const idsToPromote = Array.from(selectedIds);
    if (idsToPromote.length === 0) return;

    let successCount = 0;
    toast.info(`Promoting ${idsToPromote.length} items to organization catalog...`);

    for (const id of idsToPromote) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      try {
        await promote.mutateAsync({
          id: item.id,
          category: item.category ?? undefined,
          defaultUnit: item.unit ?? undefined,
        });
        successCount++;
      } catch {
        // continue
      }
    }

    setSelectedIds(new Set());
    utils.materialCatalog.unrecognizedList.invalidate();
    utils.materialCatalog.unrecognizedCount.invalidate();
    utils.materialCatalog.list.invalidate();
    toast.success(`Successfully promoted ${successCount} items.`);
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    if (!confirm(`Ignore and dismiss ${idsToDelete.length} selected unrecognized items?`)) {
      return;
    }

    let successCount = 0;
    for (const id of idsToDelete) {
      try {
        await deleteEntry.mutateAsync({ id });
        successCount++;
      } catch {
        // continue
      }
    }

    setSelectedIds(new Set());
    utils.materialCatalog.unrecognizedList.invalidate();
    utils.materialCatalog.unrecognizedCount.invalidate();
    toast.success(`Dismissed ${successCount} items.`);
  };

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Check className="mx-auto h-8 w-8 mb-2 opacity-40 text-emerald-500" />
          No unrecognized materials. All materials used in projects are in the catalog.
        </CardContent>
      </Card>
    );
  }

  const allSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length;

  return (
    <div className="space-y-[3px]">
      <p className="text-[11px] text-muted-foreground">
        These materials were added at the project level but do not exist in the Master Catalog yet.
        Promote them to sync them.
      </p>

      {/* Toolbars and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search unrecognized items..."
              className="pl-8 h-8 text-xs"
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={toggleAll}
            className="h-8 text-xs px-2.5"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 animate-fade-in">
              <Button
                size="sm"
                onClick={handleBulkPromote}
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                Promote Selected ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkDelete}
                className="h-8 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 font-medium"
              >
                Ignore ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* List of items */}
      <div className="space-y-[3px]">
        {filteredItems.map((item) => {
          const isSelected = selectedIds.has(item.id);
          const fuzzyMatch = getFuzzyMatch(item.name);

          return (
            <Card
              key={item.id}
              className={cn(
                "p-[6px] border border-border/40 bg-card/40 backdrop-blur-xs transition-colors",
                isSelected && "bg-amber-500/5 border-amber-500/30"
              )}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(item.id)}
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground font-mono">
                      {item.name}
                    </span>
                    {item.unit && (
                      <span className="text-[10px] text-muted-foreground font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.2 rounded">
                        {item.unit}
                      </span>
                    )}
                    {item.count > 1 && (
                      <Badge
                        variant="outline"
                        className="text-[9px] py-0 leading-none h-4 border-amber-200/50 bg-amber-500/5 text-amber-600"
                      >
                        Used {item.count}x
                      </Badge>
                    )}

                    {fuzzyMatch && (
                      <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Similar to existing: &quot;{fuzzyMatch.name} {fuzzyMatch.subCategory || ""}&quot;
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium px-2.5"
                    disabled={promote.isPending}
                    onClick={() =>
                      promote.mutate({
                        id: item.id,
                        category: item.category ?? undefined,
                        defaultUnit: item.unit ?? undefined,
                      })
                    }
                  >
                    {promote.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Plus className="h-3 w-3 mr-1" />
                    )}
                    Promote
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0"
                    onClick={() => {
                      if (confirm(`Ignore "${item.name}"?`)) {
                        deleteEntry.mutate({ id: item.id });
                      }
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No unrecognized items match your search.
          </div>
        )}
      </div>
    </div>
  );
}
