"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Plus,
  Ban,
  Building2,
  Globe,
  RefreshCw,
  Search,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  PromoteUncatalogedDialog,
  type UncatalogedReviewItem,
} from "./promote-uncataloged-dialog";

export function UnrecognizedBadge({ organizationId }: { organizationId?: string }) {
  const { data } = trpc.uncatalogedMaterial.stats.useQuery({
    level: "org",
    organizationId,
  });
  if (!data?.pending) return null;
  return (
    <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-[10px] leading-none">
      {data.pending}
    </Badge>
  );
}

export function UnrecognizedMaterialsTab({
  level = "org",
  organizationId,
}: {
  level?: "global" | "org";
  organizationId?: string;
}) {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<"pending" | "mapped" | "ignored" | "all">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [itemToPromote, setItemToPromote] = useState<UncatalogedReviewItem | null>(null);
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);

  const statsQuery = trpc.uncatalogedMaterial.stats.useQuery({
    level,
    organizationId,
  });

  const listQuery = trpc.uncatalogedMaterial.list.useQuery({
    level,
    organizationId,
    status: statusFilter,
  });

  const promoteToOrgMutation = trpc.uncatalogedMaterial.promoteToOrg.useMutation({
    onSuccess: () => {
      utils.uncatalogedMaterial.invalidate();
      utils.catalogV2.listMaterials.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const mapMutation = trpc.uncatalogedMaterial.mapToExisting.useMutation({
    onSuccess: (data) => {
      toast.success(`Successfully mapped to catalog (${data.remappedCount} project records linked)`);
      utils.uncatalogedMaterial.invalidate();
      utils.catalogV2.listMaterials.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const ignoreMutation = trpc.uncatalogedMaterial.ignore.useMutation({
    onSuccess: () => {
      toast.success("Item marked as ignored");
      utils.uncatalogedMaterial.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const scanMutation = trpc.uncatalogedMaterial.scanProjects.useMutation({
    onSuccess: (res) => {
      utils.uncatalogedMaterial.invalidate();
      if (res.addedCount > 0) {
        toast.success(`Discovered ${res.addedCount} uncataloged project material(s) for review.`);
      } else {
        toast.info("All project materials are already mapped or reviewed.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const stats = statsQuery.data || { pending: 0, mapped: 0, promoted: 0, ignored: 0, total: 0 };
  const rawItems = listQuery.data?.items || [];

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rawItems;
    return rawItems.filter(
      (item) =>
        item.rawName.toLowerCase().includes(q) ||
        (item.unit && item.unit.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
    );
  }, [rawItems, searchQuery]);

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
    let forbidden = false;

    toast.info(`Promoting ${idsToPromote.length} items to organization catalog...`);

    for (const id of idsToPromote) {
      const item = rawItems.find((i) => i.id === id);
      if (!item) continue;

      const raw = item.rawName.trim();
      const parenMatch = raw.match(/^(.*?)\s*\((.*?)\)$/);
      const parsedName = parenMatch ? parenMatch[1].trim() : raw;
      const parsedSpec = parenMatch ? parenMatch[2].trim() : undefined;

      try {
        await promoteToOrgMutation.mutateAsync({
          id: item.id,
          name: parsedName,
          subCategory: parsedSpec,
          category: item.category ?? undefined,
          defaultUnit: item.unit || "unit",
        });
        successCount++;
      } catch (err: any) {
        if (err?.message?.toLowerCase().includes("admin") || err?.message?.toLowerCase().includes("forbidden")) {
          forbidden = true;
        }
      }
    }

    setSelectedIds(new Set());
    utils.uncatalogedMaterial.invalidate();
    utils.catalogV2.listMaterials.invalidate();

    if (forbidden && successCount === 0) {
      toast.error("Organization Admin permissions required to promote materials to the Organization Catalog.");
    } else if (successCount > 0) {
      toast.success(`Successfully promoted ${successCount} items to Organization Catalog.`);
    }
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    if (!confirm(`Ignore and dismiss ${idsToDelete.length} selected unrecognized items?`)) {
      return;
    }

    for (const id of idsToDelete) {
      try {
        await ignoreMutation.mutateAsync({ id });
      } catch {}
    }

    setSelectedIds(new Set());
    utils.uncatalogedMaterial.invalidate();
    toast.success(`Ignored ${idsToDelete.length} items.`);
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Layers className="h-4 w-4 text-amber-500" />
            Uncataloged Materials Governance
          </div>
          <Badge variant="outline" className="bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200">
            {stats.pending} Needs Review
          </Badge>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50 text-xs">
          <button
            onClick={() => setStatusFilter("pending")}
            className={`px-2.5 py-1 rounded-md transition-all font-medium ${
              statusFilter === "pending"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending ({stats.pending})
          </button>
          <button
            onClick={() => setStatusFilter("mapped")}
            className={`px-2.5 py-1 rounded-md transition-all font-medium ${
              statusFilter === "mapped"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mapped ({stats.mapped})
          </button>
          <button
            onClick={() => setStatusFilter("ignored")}
            className={`px-2.5 py-1 rounded-md transition-all font-medium ${
              statusFilter === "ignored"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Ignored ({stats.ignored})
          </button>
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-2.5 py-1 rounded-md transition-all font-medium ${
              statusFilter === "all"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({stats.total})
          </button>
        </div>
      </div>

      {/* Toolbar: Search, Select All, Scan */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search unrecognized materials..."
              className="h-8 text-xs pl-8"
            />
          </div>
          {statusFilter === "pending" && filteredItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAll}
              className="h-8 text-xs shrink-0"
            >
              {selectedIds.size === filteredItems.length ? "Deselect All" : "Select All"}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && statusFilter === "pending" && (
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

          <Button
            size="sm"
            variant="outline"
            onClick={() => scanMutation.mutate({ level, organizationId })}
            disabled={scanMutation.isPending}
            className="h-8 text-xs gap-1.5 shrink-0"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", scanMutation.isPending && "animate-spin text-amber-500")} />
            {scanMutation.isPending ? "Scanning Projects..." : "Scan Projects"}
          </Button>
        </div>
      </div>

      {/* Items List */}
      {listQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/70 bg-muted/10">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2 opacity-80" />
          <h3 className="text-sm font-semibold text-foreground">
            {searchQuery ? "No matching uncataloged materials" : "No uncataloged materials in this queue"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {searchQuery
              ? "Try clearing your search query."
              : "All materials used in projects are recognized in the catalog, or have already been reviewed."}
          </p>
          {!searchQuery && statusFilter === "pending" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => scanMutation.mutate({ level, organizationId })}
              disabled={scanMutation.isPending}
              className="mt-4 h-8 text-xs gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", scanMutation.isPending && "animate-spin text-amber-500")} />
              Scan Projects for Custom Materials
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => {
            const isSelected = selectedIds.has(item.id);
            const suggestions = item.suggestions || [];
            const isPendingStatus = item.status === "pending";

            return (
              <Card
                key={item.id}
                className={cn(
                  "p-3 border border-border/70 shadow-xs bg-card hover:border-border transition-all",
                  isSelected && "bg-amber-500/5 border-amber-500/30"
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Left: Material Info & Suggestions */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {isPendingStatus && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        className="mt-1 rounded border-border text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                      />
                    )}

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-foreground font-mono">
                          {item.rawName}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted/60">
                          {item.sourceType || "project_material"}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Used {item.occurrenceCount}×
                        </Badge>
                        {item.unit && (
                          <span className="text-[11px] text-muted-foreground font-mono bg-muted/80 px-1.5 py-0.5 rounded">
                            {item.unit}
                          </span>
                        )}
                        {item.category && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/80">
                            {item.category}
                          </Badge>
                        )}
                      </div>

                      {/* Smart Fuzzy Suggestions Box */}
                      {isPendingStatus && suggestions.length > 0 && (
                        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 space-y-1.5 max-w-xl">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            <Sparkles className="h-3 w-3" />
                            <span>Catalog Match Suggestions:</span>
                          </div>
                          <div className="space-y-1">
                            {suggestions.slice(0, 2).map((sugg) => {
                              const scorePct = Math.round((sugg.score || 0) * 100);
                              return (
                                <div
                                  key={sugg.id}
                                  className="flex items-center justify-between bg-background/90 border border-border/40 rounded px-2 py-1 text-xs"
                                >
                                  <div className="min-w-0 pr-2">
                                    <span className="font-semibold text-foreground">{sugg.name}</span>
                                    {sugg.subCategory && (
                                      <span className="text-muted-foreground ml-1">({sugg.subCategory})</span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground ml-2">
                                      {scorePct}% match • {sugg.category || "General"}
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={mapMutation.isPending}
                                    onClick={() =>
                                      mapMutation.mutate({
                                        id: item.id,
                                        targetType: level,
                                        targetId: sugg.id,
                                      })
                                    }
                                    className="h-6 text-[11px] px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 shrink-0 gap-1"
                                  >
                                    <Check className="h-3 w-3" />
                                    Map to this
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 justify-end self-end lg:self-center">
                    {isPendingStatus ? (
                      <>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium px-2.5 gap-1 shadow-xs"
                          onClick={() => {
                            setItemToPromote({
                              id: item.id,
                              name: item.rawName,
                              rawName: item.rawName,
                              category: item.category,
                              unit: item.unit,
                              count: item.occurrenceCount,
                              suggestions: item.suggestions,
                            });
                            setShowPromoteDialog(true);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                          Promote to {level === "global" ? "Global" : "Org"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-2"
                          disabled={ignoreMutation.isPending}
                          onClick={() => {
                            if (confirm(`Ignore "${item.rawName}"?`)) {
                              ignoreMutation.mutate({ id: item.id });
                            }
                          }}
                        >
                          <Ban className="h-3 w-3 mr-1" />
                          Ignore
                        </Button>
                      </>
                    ) : item.status === "mapped" ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 gap-1 px-2 py-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" /> Mapped
                      </Badge>
                    ) : item.status === "promoted" ? (
                      <Badge variant="outline" className="bg-info/10 text-info dark:bg-[var(--navy-deep)]/40 dark:text-info/80 border-info/30 gap-1 px-2 py-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" /> Promoted
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground gap-1 px-2 py-1 text-xs">
                        <Ban className="h-3 w-3" /> Ignored
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Interactive Review & Promote Dialog */}
      <PromoteUncatalogedDialog
        open={showPromoteDialog}
        onOpenChange={setShowPromoteDialog}
        item={itemToPromote}
        level={level}
      />
    </div>
  );
}
