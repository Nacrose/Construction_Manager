"use client";

import {useState, useEffect, Fragment} from "react";
import {useMutation} from "@tanstack/react-query";
import Link from "next/link";
import {Card} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";

import { InlineAnalysisEditor } from "./inline-analysis-editor";
import { PresetCombobox } from "./preset-combobox";

function MatrixPanel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded border border-border bg-card shadow-[0_0_16px_rgba(52,211,153,0.10)] transition-all duration-200",
      className
    )}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/60 select-none shrink-0 relative z-10">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_#6fcf87]" />
          <span className="text-xs font-mono font-bold tracking-wider text-primary uppercase">{title}</span>
        </div>
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function AnalysisLibraryTab({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const utils = trpc.useUtils() as any;
  const [visibleLibs, setVisibleLibs] = useState<Set<string>>(new Set(["client_estimate", "contractor_bid", "contractor_actual"]));
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [activeLib, setActiveLib] = useState<string>("client_estimate");
  const [quickPreset, setQuickPreset] = useState("");

  const { data: presetsData } = trpc.globalPreset.list.useQuery({});

  const quickLoadMutation = trpc.globalPreset.load.useMutation({
    onSuccess: (d) => {
      utils.analysisLibrary.getItems.invalidate();
      utils.boq.list.invalidate({ projectId });
      toast.success(`Loaded "${d.presetName}" into first empty item`);
      setQuickPreset("");
    },
    onError: (e) => toast.error(e.message),
  });

  // Set which of the three analysis libraries (Client's Estimate /
  // Contractor Bid / Contractor's Actual) is the project's default — the
  // one the rest of the app pulls ingredient data from.
  const setDefaultLib = trpc.analysisLibrary.setDefault.useMutation({
    onSuccess: (d) => {
      utils.analysisLibrary.list.invalidate({ projectId });
      utils.rateAnalysis.getResources.invalidate({ projectId });
      utils.gantt.list.invalidate({ projectId });
      toast.success("Default analysis library updated");
    },
    onError: (e) => toast.error(e.message),
  });  const copyIngredientsMut = trpc.rateAnalysis.copyIngredients.useMutation({
    onSuccess: () => {
      utils.analysisLibrary.getItems.invalidate();
      toast.success("Copied ingredients");
    },
    onError: (e) => toast.error(e.message),
  });

  const copyEstimateToActual = useMutation({
    mutationFn: async () => {
      const estLib = libsData?.libraries.find((l) => l.purpose === "client_estimate");
      const actLib = libsData?.libraries.find((l) => l.purpose === "contractor_actual");
      if (!estLib || !actLib) throw new Error("Libraries not found");

      const estItems = await utils.analysisLibrary.getItems.fetch({ projectId, libraryId: estLib.id });

      let copied = 0;
      for (const item of estItems.items) {
        if (!item.analysisId || item.ingredientCount === 0) continue;

        const actAnalyses = await utils.rateAnalysis.list.fetch({ itemId: item.id });
        const actAnalysis = actAnalyses.analyses.find((a: any) => a.name === "Contractor's Actual");
        const estAnalysis = actAnalyses.analyses.find((a: any) => a.name === "Client's Estimate");
        if (!actAnalysis || !estAnalysis) continue;

        await utils.rateAnalysis.copyIngredients.mutateAsync({
          itemId: item.id,
          sourceAnalysisId: estAnalysis.id,
          targetAnalysisId: actAnalysis.id,
        });
        copied++;
      }
      return { copied };
    },
    onSuccess: (d) => {
      utils.analysisLibrary.getItems.invalidate();
      utils.boq.list.invalidate({ projectId });
      toast.success(`Copied ${d.copied} items from Client's Estimate to Contractor's Actual`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyEstimateToBid = useMutation({
    mutationFn: async () => {
      const estLib = libsData?.libraries.find((l) => l.purpose === "client_estimate");
      const bidLib = libsData?.libraries.find((l) => l.purpose === "contractor_bid");
      if (!estLib || !bidLib) throw new Error("Libraries not found");

      const estItems = await utils.analysisLibrary.getItems.fetch({ projectId, libraryId: estLib.id });

      let copied = 0;
      for (const item of estItems.items) {
        if (!item.analysisId || item.ingredientCount === 0) continue;

        const bidAnalyses = await utils.rateAnalysis.list.fetch({ itemId: item.id });
        const bidAnalysis = bidAnalyses.analyses.find((a: any) => a.name === "Contractor Bid");
        const estAnalysis = bidAnalyses.analyses.find((a: any) => a.name === "Client's Estimate");
        if (!bidAnalysis || !estAnalysis) continue;

        await utils.rateAnalysis.copyIngredients.mutateAsync({
          itemId: item.id,
          sourceAnalysisId: estAnalysis.id,
          targetAnalysisId: bidAnalysis.id,
        });
        copied++;
      }
      return { copied };
    },
    onSuccess: (d) => {
      utils.analysisLibrary.getItems.invalidate();
      utils.boq.list.invalidate({ projectId });
      toast.success(`Copied ${d.copied} items from Client's Estimate to Contractor Bid`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: libsData, isLoading: libsLoading } = trpc.analysisLibrary.list.useQuery({ projectId });

  const estLib = libsData?.libraries.find((l) => l.purpose === "client_estimate");
  const bidLib = libsData?.libraries.find((l) => l.purpose === "contractor_bid");
  const actLib = libsData?.libraries.find((l) => l.purpose === "contractor_actual");

  const { data: estData, isLoading: estDataLoading, error: estDataError } = trpc.analysisLibrary.getItems.useQuery(
    { projectId, libraryId: estLib?.id ?? "" }, { enabled: !!estLib }
  );
  const { data: bidData } = trpc.analysisLibrary.getItems.useQuery(
    { projectId, libraryId: bidLib?.id ?? "" }, { enabled: !!bidLib }
  );
  const { data: actData } = trpc.analysisLibrary.getItems.useQuery(
    { projectId, libraryId: actLib?.id ?? "" }, { enabled: !!actLib }
  );

  const buildLookup = (data: any) => {
    const map = new Map<string, any>();
    data?.items.forEach((item: any) => map.set(item.id, item));
    return map;
  };
  const estByItem = buildLookup(estData);
  const bidByItem = buildLookup(bidData);
  const actByItem = buildLookup(actData);

  async function copyIngredients(itemId: string, sourceAnalysisId: string, targetAnalysisId: string) {
    if (sourceAnalysisId === targetAnalysisId) return;
    try {
      await copyIngredientsMut.mutateAsync({ itemId, sourceAnalysisId, targetAnalysisId });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function toggleExpand(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleLib(lib: string) {
    setVisibleLibs((prev) => {
      const next = new Set(prev);
      if (next.has(lib)) next.delete(lib);
      else next.add(lib);
      return next;
    });
  }

  const LIB_CONFIG: Record<string, { label: string; short: string; color: string; badge: string }> = {
    client_estimate: { label: "Client's Estimate", short: "Estimate", color: "text-info dark:text-info/80", badge: "billing" },
    contractor_bid: { label: "Contractor Bid", short: "Bid", color: "text-amber-600 dark:text-amber-400", badge: "bid" },
    contractor_actual: { label: "Contractor's Actual", short: "Actual", color: "text-purple-600 dark:text-purple-400", badge: "costing" },
  };

  const items = estData?.items ?? [];

  return (
    <div className="space-y-2">
      {/* Consolidated 1-Line HUD Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 rounded border border-border/60 bg-muted/40 font-mono text-xs">
        {/* Left: Column Visibility Toggles & Default Library */}
        <div className="flex items-center gap-3">
          {/* Visibility Checkboxes */}
          <div className="flex items-center gap-2 border-r border-border/60 pr-3">
            {(["client_estimate", "contractor_bid", "contractor_actual"] as const).map((lib) => {
              const cfg = LIB_CONFIG[lib];
              const checked = visibleLibs.has(lib);
              return (
                <label key={lib} className="flex cursor-pointer items-center gap-1 text-[11px] font-bold select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLib(lib)}
                    className="h-3 w-3 rounded border-border text-primary accent-primary"
                  />
                  <span className={cfg.color}>{cfg.short}</span>
                </label>
              );
            })}
          </div>

          {/* Default Library Selector */}
          {libsData && libsData.libraries.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Default:</span>
              <div className="w-48">
                <PresetCombobox
                  presets={libsData.libraries.map((l) => ({
                    id: l.id,
                    name: l.name,
                    source: l.purpose.replace("_", " "),
                    ingredientCount: l._count?.analyses,
                  }))}
                  selected={libsData.defaultLibraryId ?? ""}
                  onSelect={(id) => setDefaultLib.mutate({ projectId, libraryId: id })}
                  placeholder="Default Library…"
                  disabled={!canWrite || setDefaultLib.isPending}
                  popoverWidth={280}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {libsLoading ? (
        <Skeleton className="h-64" />
      ) : !libsData || libsData.libraries.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {canWrite
            ? "Setting up analysis libraries…"
            : "No analysis libraries configured. Ask a Project Manager to set up the analysis libraries."}
        </Card>
      ) : !estLib ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Libraries exist but no library matches the expected names (Client's Estimate, Contractor Bid, Contractor's Actual). Check your library setup.
        </Card>
      ) : estDataLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading analysis data…</span>
        </div>
      ) : estDataError ? (
        <Card className="p-8 text-center text-sm text-red-600">
          Failed to load analysis data: {estDataError.message}
        </Card>
      ) : estData ? (
        <MatrixPanel title="Rate Analysis Matrix">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-md border-b border-border/80">
                <tr className="text-left text-[11px] text-primary uppercase font-mono font-bold tracking-wide border-b border-border/40">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-3 py-2 font-semibold">Code</th>
                  <th className="px-3 py-2 font-semibold">Description</th>
                  <th className="px-3 py-2 font-semibold">Unit</th>
                  <th className="px-3 py-2 text-right font-semibold">BOQ Rate</th>
                  {(["client_estimate", "contractor_bid", "contractor_actual"] as const).map((lib) => {
                    if (!visibleLibs.has(lib)) return null;
                    return (
                      <th key={lib} className={`px-3 py-2 text-right font-semibold ${LIB_CONFIG[lib].color}`}>
                        {LIB_CONFIG[lib].short} Rate
                      </th>
                    );
                  })}
                  {visibleLibs.size >= 2 && (
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Spread</th>
                  )}
                  <th className="px-3 py-2 text-center font-semibold">Items</th>
                  <th className="w-12 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isExpanded = expandedItems.has(item.id);
                  const est = estByItem.get(item.id);
                  const bid = bidByItem.get(item.id);
                  const act = actByItem.get(item.id);
                  const rates: number[] = [];
                  if (visibleLibs.has("client_estimate") && est?.ratePerUnit) rates.push(est.ratePerUnit);
                  if (visibleLibs.has("contractor_bid") && bid?.ratePerUnit) rates.push(bid.ratePerUnit);
                  if (visibleLibs.has("contractor_actual") && act?.ratePerUnit) rates.push(act.ratePerUnit);
                  const spread = rates.length >= 2 ? Math.max(...rates) - Math.min(...rates) : 0;

                  return (
                    <Fragment key={item.id}>
                      <tr className={cn(
                        "border-b border-border/40 transition-colors duration-150 hover:bg-primary/5",
                        idx % 2 === 1 ? "bg-muted/20" : ""
                      )}>
                        <td className="p-1.5 text-center">
                          <button onClick={() => toggleExpand(item.id)} className="rounded p-1 text-primary hover:bg-primary/10">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                        <td className="px-3 py-1.5 font-bold text-primary">{item.code}</td>
                        <td className="px-3 py-1.5 truncate max-w-xs text-foreground">{item.description}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{item.unit}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-foreground">{item.rate > 0 ? formatNpr(item.rate) : "—"}</td>
                        {(["client_estimate", "contractor_bid", "contractor_actual"] as const).map((lib) => {
                          if (!visibleLibs.has(lib)) return null;
                          const lookup = lib === "client_estimate" ? est : lib === "contractor_bid" ? bid : act;
                          const val = lookup?.ratePerUnit ?? 0;
                          return (
                            <td key={lib} className={`px-3 py-1.5 text-right font-medium ${lib === "client_estimate" ? "text-info/80" : lib === "contractor_bid" ? "text-amber-400" : "text-purple-400"}`}>
                              {val > 0 ? formatNpr(val) : <span className="italic text-muted-foreground">—</span>}
                            </td>
                          );
                        })}
                        {visibleLibs.size >= 2 && (
                          <td className={`px-3 py-1.5 text-right font-bold ${spread === 0 ? "text-muted-foreground" : "text-amber-400"}`}>
                            {spread > 0 ? formatNpr(spread) : "—"}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-center text-muted-foreground">{item.ingredientCount}</td>
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => toggleExpand(item.id)} className="text-primary font-bold hover:underline text-[11px]">
                            {isExpanded ? "Close" : "Edit"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/5">
                          <td></td>
                          <td colSpan={5 + (visibleLibs.size >= 2 ? 1 : 0) + visibleLibs.size} className="p-3">
                            <div className="rounded-md border bg-background">
                              {/* Header bar */}
                              <div className="flex items-center justify-between border-b px-3 py-2">
                                <span className="text-sm font-semibold">
                                  Rate Analysis — {item.code} {item.description}
                                </span>
                                <button onClick={() => toggleExpand(item.id)} className="rounded p-1 hover:bg-muted">
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              </div>

                              {/* Library tabs */}
                              <div className="flex items-center gap-1 border-b px-3 py-1.5">
                                {(["client_estimate", "contractor_bid", "contractor_actual"] as const).map((lib) => {
                                  if (!visibleLibs.has(lib)) return null;
                                  return (
                                    <button
                                      key={lib}
                                      onClick={() => setActiveLib(lib)}
                                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                        activeLib === lib
                                          ? "bg-foreground text-background"
                                          : "text-muted-foreground hover:bg-muted"
                                      }`}
                                    >
                                      {LIB_CONFIG[lib].label}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Copy from other libraries */}
                              {canWrite && (
                                <div className="flex items-center gap-2 border-b px-3 py-1">
                                  <span className="text-[10px] text-muted-foreground">Copy from:</span>
                                  {([["client_estimate", est], ["contractor_bid", bid], ["contractor_actual", act]] as const)
                                    .filter(([lib]) => lib !== activeLib && visibleLibs.has(lib))
                                    .map(([lib, lookup]) => {
                                      if (!lookup?.analysisId) return null;
                                      return (
                                        <button
                                          key={lib}
                                          onClick={() => {
                                            const targetId = (activeLib === "client_estimate" ? est
                                              : activeLib === "contractor_bid" ? bid : act)?.analysisId;
                                            if (!targetId || !lookup.analysisId) return;
                                            if (!confirm(`Replace ${LIB_CONFIG[activeLib].label} ingredients with ${LIB_CONFIG[lib].label}?`)) return;
                                            copyIngredients(item.id, lookup.analysisId, targetId);
                                          }}
                                          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                                        >
                                          {LIB_CONFIG[lib].label}
                                        </button>
                                      );
                                    })}
                                </div>
                              )}

                              {/* Active library editor */}
                              <div className="p-3">
                                {(() => {
                                  const lookup = activeLib === "client_estimate" ? est
                                    : activeLib === "contractor_bid" ? bid : act;
                                  return (
                                    <InlineAnalysisEditor
                                      itemId={item.id}
                                      analysisId={lookup?.analysisId ?? null}
                                      projectId={projectId}
                                      itemUnit={item.unit}
                                      canWrite={canWrite}
                                    />
                                  );
                                })()}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td colSpan={4} className="p-3 text-right text-muted-foreground">Project totals:</td>
                    <td className="p-3 text-right">{formatNpr(items.reduce((s, i) => s + i.rate * i.quantity, 0))}</td>
                    {(["client_estimate", "contractor_bid", "contractor_actual"] as const).map((lib) => {
                      if (!visibleLibs.has(lib)) return null;
                      const lookup = lib === "client_estimate" ? estByItem : lib === "contractor_bid" ? bidByItem : actByItem;
                      const total = items.reduce((s, i) => {
                        const v = lookup.get(i.id);
                        return s + (v?.ratePerUnit ?? 0) * i.quantity;
                      }, 0);
                      return (
                        <td key={lib} className={`p-3 text-right ${lib === "client_estimate" ? "text-success dark:text-success/80" : "text-muted-foreground"}`}>
                          {formatNpr(total)}
                        </td>
                      );
                    })}
                    {visibleLibs.size >= 2 && <td colSpan={1}></td>}
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </MatrixPanel>
      ) : null}
    </div>
  );
}
