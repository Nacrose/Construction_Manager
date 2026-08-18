"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Plus,
  Ban,
  Globe,
  Building2,
  AlertTriangle,
  FolderSync,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

export function UncatalogedReviewTab({ organizationId }: { organizationId?: string }) {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<"pending" | "mapped" | "promoted" | "ignored" | "all">("pending");

  const statsQuery = trpc.uncatalogedMaterial.stats.useQuery({
    level: "org",
    organizationId,
  });

  const listQuery = trpc.uncatalogedMaterial.list.useQuery({
    level: "org",
    organizationId,
    status: statusFilter,
  });

  const mapMutation = trpc.uncatalogedMaterial.mapToExisting.useMutation({
    onSuccess: (data) => {
      toast.success(`Successfully mapped to catalog (${data.remappedCount} project records updated)`);
      utils.uncatalogedMaterial.invalidate();
      utils.orgMaterialEntry.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const ignoreMutation = trpc.uncatalogedMaterial.ignore.useMutation({
    onSuccess: () => {
      toast.success("Item marked as one-time / ignored");
      utils.uncatalogedMaterial.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const adoptCustomMutation = trpc.orgMaterialEntry.createCustom.useMutation({
    onSuccess: (data) => {
      toast.success(data.matchedGlobal ? "Auto-adopted matching global material" : "Created new custom org material");
      utils.uncatalogedMaterial.invalidate();
      utils.orgMaterialEntry.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const stats = statsQuery.data || { pending: 0, mapped: 0, promoted: 0, ignored: 0, total: 0 };

  return (
    <div className="space-y-4">
      {/* Header & Status Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Layers className="h-4 w-4 text-amber-500" />
            Uncataloged Materials Moderation Queue
          </div>
          <Badge variant="outline" className="bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200">
            {stats.pending} Needs Review
          </Badge>
        </div>

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

      {/* List of Items */}
      {listQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : listQuery.data?.items.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/70 bg-muted/10">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2 opacity-80" />
          <h3 className="text-sm font-semibold text-foreground">No uncataloged materials in this view</h3>
          <p className="text-xs text-muted-foreground mt-1">
            All project materials in this organization are properly cataloged and mapped.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {listQuery.data?.items.map((item) => {
            const suggestions = item.suggestions || [];
            const bestMatch = suggestions[0];

            return (
              <Card
                key={item.id}
                className="p-4 border border-border/80 shadow-sm bg-card hover:border-border transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Material Info */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground">
                        {item.rawName}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted/80">
                        {item.sourceType}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Seen {item.occurrenceCount}×
                      </Badge>
                      {item.unit && (
                        <span className="text-xs text-muted-foreground">
                          Unit: <strong className="text-foreground">{item.unit}</strong>
                        </span>
                      )}
                      {item.category && (
                        <span className="text-xs text-muted-foreground">
                          Category: <strong className="text-foreground">{item.category}</strong>
                        </span>
                      )}
                    </div>

                    {/* Fuzzy Suggestions Pill Box */}
                    {item.status === "pending" && suggestions.length > 0 && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          <Sparkles className="h-3 w-3" /> Suggested Matches in Catalog ({suggestions.length}):
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                          {suggestions.map((sug) => {
                            const scorePct = Math.round(sug.score * 100);
                            return (
                              <div
                                key={`${sug.scope}-${sug.id}`}
                                className="flex items-center justify-between p-2 rounded-md bg-background/80 border border-border/70 hover:border-primary/50 text-xs transition-colors"
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-1">
                                    <span className="font-semibold text-foreground truncate">
                                      {sug.name}
                                    </span>
                                    {sug.scope === "global" ? (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 gap-0.5">
                                        <Globe className="h-2 w-2" /> Global
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 gap-0.5">
                                        <Building2 className="h-2 w-2" /> Org
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    {scorePct}% confidence • {sug.defaultUnit || "unit"}
                                  </div>
                                </div>

                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-6 px-2 text-[10px] shrink-0 gap-1 bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary font-medium"
                                  disabled={mapMutation.isPending}
                                  onClick={() => {
                                    mapMutation.mutate({
                                      id: item.id,
                                      targetType: sug.scope,
                                      targetId: sug.id,
                                    });
                                  }}
                                >
                                  Map <ArrowRight className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  {item.status === "pending" && (
                    <div className="flex flex-wrap lg:flex-col gap-2 shrink-0 justify-end">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs gap-1.5 shadow-sm"
                        disabled={adoptCustomMutation.isPending}
                        onClick={() => {
                          adoptCustomMutation.mutate({
                            organizationId,
                            name: item.rawName,
                            unit: item.unit || "unit",
                            category: item.category || undefined,
                          });
                        }}
                      >
                        <Plus className="h-3 w-3" /> Add to Org Catalog
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        disabled={ignoreMutation.isPending}
                        onClick={() => ignoreMutation.mutate({ id: item.id })}
                      >
                        <Ban className="h-3 w-3" /> Ignore
                      </Button>
                    </div>
                  )}

                  {item.status === "mapped" && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 gap-1 px-2 py-1">
                      <CheckCircle2 className="h-3 w-3" /> Mapped
                    </Badge>
                  )}

                  {item.status === "ignored" && (
                    <Badge variant="outline" className="bg-muted text-muted-foreground gap-1 px-2 py-1">
                      <Ban className="h-3 w-3" /> Ignored
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
