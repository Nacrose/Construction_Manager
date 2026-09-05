"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  X,
  Plus,
  Trash2,
  Copy,
  Save,
  Package,
  Users,
  Wrench,
  Percent,
  Calculator,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import type { BoqItem } from "../types";
import { UNITS } from "../types";
import { PresetCombobox } from "./preset-combobox";
import { IngredientPicker } from "@/components/rate-catalog/ingredient-picker";

export type RateAnalysisInspectorProps = {
  item: BoqItem | null;
  projectId: string;
  canWrite: boolean;
  onClose: () => void;
};

const LIB_TABS = [
  { id: "client_estimate", short: "Estimate", label: "Client Estimate" },
  { id: "contractor_bid", short: "Bid", label: "Contractor Bid" },
  { id: "contractor_actual", short: "Actual", label: "Actual Cost" },
];

export function RateAnalysisInspector({
  item,
  projectId,
  canWrite,
  onClose,
}: RateAnalysisInspectorProps) {
  const utils = trpc.useUtils() as any;

  const [activePurpose, setActivePurpose] = useState<string>("client_estimate");
  const [addingMode, setAddingMode] = useState<"none" | "material" | "labor" | "equipment" | "overhead">("none");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [savePresetName, setSavePresetName] = useState("");
  const [presetToLoad, setPresetToLoad] = useState("");

  // Rate catalog / district selection
  const [rateCatalogId, setRateCatalogId] = useState("");
  const [rateDistrict, setRateDistrict] = useState("");

  // Quick-add input state
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newPct, setNewPct] = useState("15");
  const [newUnit, setNewUnit] = useState("cum");
  const [newRate, setNewRate] = useState("");
  const [newPctBase, setNewPctBase] = useState("all");
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState("");

  // Collapsible category state
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const itemId = item?.id ?? "";

  // 1. Fetch analyses available for this item
  const { data: analysesData, isLoading: analysesLoading } = trpc.rateAnalysis.list.useQuery(
    { itemId },
    { enabled: !!itemId }
  );

  const currentAnalysis = useMemo(() => {
    if (!analysesData?.analyses?.length) return null;
    const targetName =
      activePurpose === "client_estimate"
        ? "Client's Estimate"
        : activePurpose === "contractor_bid"
          ? "Contractor Bid"
          : "Contractor's Actual";
    return (
      analysesData.analyses.find((a: any) => a.name === targetName) ||
      analysesData.analyses[0]
    );
  }, [analysesData, activePurpose]);

  const analysisId = currentAnalysis?.id ?? null;

  // 2. Fetch ingredients for current analysis
  const { data: ingData, isLoading: ingLoading } = trpc.rateAnalysis.listIngredients.useQuery(
    { itemId, analysisId: analysisId! },
    { enabled: !!itemId && !!analysisId }
  );

  // 3. Fetch rate catalogs for district lookup
  const { data: catalogsData } = trpc.catalogV2.listRateCatalogs.useQuery({});
  const activeCatalog = catalogsData?.catalogs?.find((c) => c.id === rateCatalogId);

  const { data: catalogDetails } = trpc.catalogV2.getRateCatalog.useQuery(
    { id: rateCatalogId },
    { enabled: !!rateCatalogId }
  );

  // 4. Presets
  const { data: presetsData } = trpc.globalPreset.listOrg.useQuery({});

  // Mutations
  const addMutation = trpc.rateAnalysis.addIngredient.useMutation({
    onSuccess: () => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
      utils.analysisLibrary.getItems.invalidate();
      utils.boq.list.invalidate({ projectId });
      toast.success("Resource added to rate analysis");
      setNewName("");
      setNewQty("");
      setNewRate("");
      setSelectedResourceId("");
      setSelectedCatalogItemId("");
      setAddingMode("none");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.rateAnalysis.updateIngredient.useMutation({
    onSuccess: () => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
      utils.analysisLibrary.getItems.invalidate();
      utils.boq.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.rateAnalysis.deleteIngredient.useMutation({
    onSuccess: () => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
      utils.analysisLibrary.getItems.invalidate();
      utils.boq.list.invalidate({ projectId });
      toast.success("Resource removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateBatchMutation = trpc.rateAnalysis.update.useMutation({
    onSuccess: () => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
      utils.analysisLibrary.getItems.invalidate();
      toast.success("Batch quantity updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const loadPresetMutation = trpc.globalPreset.load.useMutation({
    onSuccess: (d) => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
      utils.analysisLibrary.getItems.invalidate();
      utils.boq.list.invalidate({ projectId });
      toast.success(`Applied norm "${d.presetName}" (${d.loaded} items)`);
      setPresetToLoad("");
    },
    onError: (e) => toast.error(e.message),
  });

  const savePresetMutation = trpc.globalPreset.saveFromAnalysis.useMutation({
    onSuccess: (d) => {
      utils.globalPreset.list.invalidate();
      toast.success(`Saved as norm preset "${d.preset.name}"`);
      setSavePresetName("");
      setShowSavePreset(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const copyIngredientsMut = trpc.rateAnalysis.copyIngredients.useMutation({
    onSuccess: () => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId });
      utils.analysisLibrary.getItems.invalidate();
      toast.success("Copied breakdown from Client's Estimate");
    },
    onError: (e) => toast.error(e.message),
  });

  function handleIngredientSelect(name: string, resource?: { id: string; name: string; unit: string; catalogMaterialId?: string | null }) {
    setNewName(name);
    setSelectedResourceId(resource?.id ?? "");
    setSelectedCatalogItemId(resource?.catalogMaterialId ?? "");
    if (resource?.unit) setNewUnit(resource.unit);
    const catId = resource?.catalogMaterialId;
    if (catId && catalogDetails?.catalog && rateDistrict) {
      const rateEntry = catalogDetails.catalog.catalogRates?.find(
        (r: any) => r.materialId === catId && r.district === rateDistrict
      );
      if (rateEntry && rateEntry.rate > 0) {
        setNewRate(String(rateEntry.rate));
      }
    }
  }

  async function handleCopyFromEstimate() {
    if (!analysesData?.analyses?.length || !analysisId) return;
    const est = analysesData.analyses.find((a: any) => a.name === "Client's Estimate");
    if (!est || est.id === analysisId) return;
    try {
      await copyIngredientsMut.mutateAsync({
        itemId,
        sourceAnalysisId: est.id,
        targetAnalysisId: analysisId,
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (!item) return null;

  const analysis = ingData?.analysis;
  const ingredients = analysis?.ingredients ?? [];
  const batch = analysis?.batchSize || 1;

  // Breakdown calculations
  const fixed = ingredients.filter((i) => (i.calcMode ?? "fixed") === "fixed");
  const percentage = ingredients.filter((i) => (i.calcMode ?? "fixed") === "percentage");

  const materials = fixed.filter((i) => i.type === "material");
  const labor = fixed.filter((i) => i.type === "labor");
  const equipment = fixed.filter((i) => i.type === "equipment");
  const overheadFixed = fixed.filter((i) => i.type === "overhead");

  const matCost = materials.reduce((s, i) => s + i.quantity * i.rate, 0);
  const labCost = labor.reduce((s, i) => s + i.quantity * i.rate, 0);
  const eqCost = equipment.reduce((s, i) => s + i.quantity * i.rate, 0);
  const ovhFixedCost = overheadFixed.reduce((s, i) => s + i.quantity * i.rate, 0);
  const directCost = matCost + labCost + eqCost + ovhFixedCost;

  let pctCost = 0;
  percentage.forEach((i) => {
    let base = 0;
    const b = i.pctBase ?? "all";
    if (b === "material") base = matCost;
    else if (b === "labor") base = labCost;
    else if (b === "equipment") base = eqCost;
    else if (b === "material_labor") base = matCost + labCost;
    else if (b === "labor_equipment") base = labCost + eqCost;
    else if (b === "all_including_pct") base = directCost + pctCost;
    else base = directCost;
    const itemPctCost = (base * (i.percentage || 0)) / 100;
    pctCost += itemPctCost;
  });

  const totalBatchCost = directCost + pctCost;
  const ratePerUnit = batch > 0 ? totalBatchCost / batch : 0;
  const missingRateCount = fixed.filter((i) => !i.rate || i.rate <= 0).length;

  // Contractor Margin Analysis
  const boqRate = item.rate || 0;
  const marginAmount = boqRate > 0 ? boqRate - ratePerUnit : 0;
  const marginPercent = boqRate > 0 ? ((boqRate - ratePerUnit) / boqRate) * 100 : 0;
  const isProfitable = marginAmount >= 0;

  return (
    <aside
      className="w-full lg:w-[460px] xl:w-[490px] shrink-0 border-l border-border/40 bg-card flex flex-col h-full z-20 overflow-hidden shadow-xl"
      aria-label="Rate Analysis Inspector"
      onWheel={(e) => e.stopPropagation()}
    >
      {/* ─── LINE 1: ULTRA-COMPACT IDENTITY & PURPOSE SWITCHER ─── */}
      <div className="h-9 px-2.5 bg-muted/40 border-b border-border/40 flex items-center justify-between gap-2 shrink-0">
        {/* Left: Code badge & Description */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10.5px] font-bold shrink-0 border border-primary/25">
            {item.code || "—"}
          </span>
          <span
            className="text-[11.5px] font-semibold text-foreground truncate min-w-0"
            title={item.description}
          >
            {item.description}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
            ({item.quantity} {item.unit || "unit"})
          </span>
        </div>

        {/* Right: Segmented Purpose Switcher & Close Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center p-0.5 rounded-md bg-background border border-border/60">
            {LIB_TABS.map((tab) => {
              const active = activePurpose === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePurpose(tab.id)}
                  title={tab.label}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-mono rounded transition-colors",
                    active
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.short}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Close Inspector (Esc)"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ─── LINE 2: NORMS, BATCH QUANTITY & LIVE RATE COMPARISON ─── */}
      <div className="h-9 px-2.5 bg-card border-b border-border/40 flex items-center justify-between gap-2 shrink-0 text-[11px] font-mono">
        {/* Left: Norms picker + Batch input */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-[155px] shrink-0">
            <PresetCombobox
              presets={
                presetsData?.presets?.map((p: any) => ({
                  id: p.id,
                  name: p.name,
                  source: p.category || p.source,
                  ingredientCount: p._count?.ingredients,
                })) ?? []
              }
              selected={presetToLoad}
              onSelect={(pid) => {
                if (!analysisId) {
                  toast.error("No rate analysis found for this item");
                  return;
                }
                setPresetToLoad(pid);
                if (confirm("Apply this norm preset to current rate analysis?")) {
                  loadPresetMutation.mutate({
                    presetId: pid,
                    rateAnalysisId: analysisId,
                    boqItemId: itemId,
                    projectId,
                    rateCatalogId: rateCatalogId || undefined,
                    district: rateDistrict || undefined,
                  });
                }
              }}
              placeholder="Apply Norms…"
              disabled={!canWrite || !analysisId || loadPresetMutation.isPending}
              popoverWidth={280}
            />
          </div>

          {/* Batch quantity */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
            <span>Batch:</span>
            <input
              key={`batch-${batch}`}
              type="number"
              step="any"
              defaultValue={batch}
              disabled={!canWrite}
              onBlur={(e) => {
                const val = parseFloat(e.target.value) || 1;
                if (val !== batch && analysisId) {
                  updateBatchMutation.mutate({ itemId, analysisId, batchSize: val });
                }
              }}
              className="w-11 px-1 py-0.5 rounded bg-background border border-border/50 text-foreground text-right text-[10px] focus:outline-hidden focus:border-primary font-mono"
            />
            <span>{item.unit || "u"}</span>
          </div>

          {/* Quick copy estimate if on bid or actual */}
          {activePurpose !== "client_estimate" && canWrite && (
            <button
              type="button"
              onClick={handleCopyFromEstimate}
              title="Copy breakdown from Client's Estimate"
              className="px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted border border-border/50 text-foreground/80 text-[10px] transition-colors flex items-center gap-1"
            >
              <Copy className="h-2.5 w-2.5" />
              <span>Copy</span>
            </button>
          )}

          {/* Save Norms button */}
          {canWrite && !showSavePreset && (
            <button
              type="button"
              onClick={() => setShowSavePreset(true)}
              title="Save current breakdown as reusable organization preset"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Save className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Right: Live Calculated RA Rate vs BOQ Rate & Margin Badge */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right leading-none">
            <span className="text-[9px] text-muted-foreground block">RA Unit Rate</span>
            <span className="text-[11.5px] font-bold text-foreground">
              {formatNpr(ratePerUnit)}
            </span>
          </div>

          {boqRate > 0 ? (
            <div
              className={cn(
                "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border",
                isProfitable
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
              )}
              title={`BOQ Rate: ${formatNpr(boqRate)} | Margin: ${isProfitable ? "+" : ""}${formatNpr(marginAmount)}/unit`}
            >
              {isProfitable ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
              <span>{isProfitable ? "+" : ""}{marginPercent.toFixed(1)}%</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Inline Save Preset Bar */}
      {showSavePreset && (
        <div className="px-2.5 py-1.5 bg-muted/70 border-b border-border/40 flex items-center gap-1.5 text-[11px] shrink-0 font-mono">
          <input
            type="text"
            placeholder="Preset Name (e.g. DoR M20 Foundation)..."
            value={savePresetName}
            onChange={(e) => setSavePresetName(e.target.value)}
            className="flex-1 px-2 py-0.5 rounded bg-background border border-border/50 text-foreground text-[11px] focus:outline-hidden focus:border-primary"
          />
          <Button
            size="sm"
            disabled={!savePresetName.trim() || !analysisId || savePresetMutation.isPending}
            onClick={() => {
              if (!analysisId) return;
              savePresetMutation.mutate({
                rateAnalysisId: analysisId,
                presetName: savePresetName.trim(),
                source: "Custom",
                category: "General",
              });
            }}
            className="h-6 px-2 text-[10px] bg-primary text-primary-foreground font-mono"
          >
            {savePresetMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </Button>
          <button
            type="button"
            onClick={() => setShowSavePreset(false)}
            className="text-muted-foreground hover:text-foreground px-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Missing Rate Alert Banner */}
      {missingRateCount > 0 && (
        <div className="px-2.5 py-1 bg-amber-500/10 border-b border-amber-500/25 text-[10px] text-amber-700 dark:text-amber-400 font-mono flex items-center gap-1 shrink-0">
          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
          <span>{missingRateCount} resource(s) missing unit rate. Analysis rate may be incomplete.</span>
        </div>
      )}

      {/* ─── RESOURCE LEDGER TABLE (MAIN BODY) ─── */}
      <div className="flex-1 min-h-0 overflow-y-auto matrix-scrollbar p-2 space-y-2">
        {ingLoading || analysesLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-6 w-full bg-muted/40" />
            <Skeleton className="h-12 w-full bg-muted/20" />
            <Skeleton className="h-12 w-full bg-muted/20" />
          </div>
        ) : (
          <>
            {/* 1. MATERIALS SECTION */}
            <CategoryLedger
              title="Materials"
              icon={<Package className="h-3.5 w-3.5 text-blue-500" />}
              subtotal={matCost}
              collapsed={collapsedCategories["materials"]}
              onToggle={() => toggleCategory("materials")}
            >
              {materials.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/60 italic py-1 px-2">No material resources added.</p>
              ) : (
                materials.map((ing) => (
                  <LedgerRow
                    key={ing.id}
                    ing={ing}
                    canWrite={canWrite}
                    onUpdate={(data) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, ...data })}
                    onDelete={() => deleteMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined })}
                  />
                ))
              )}
            </CategoryLedger>

            {/* 2. LABOR SECTION */}
            <CategoryLedger
              title="Labor & Manpower"
              icon={<Users className="h-3.5 w-3.5 text-amber-500" />}
              subtotal={labCost}
              collapsed={collapsedCategories["labor"]}
              onToggle={() => toggleCategory("labor")}
            >
              {labor.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/60 italic py-1 px-2">No labor resources added.</p>
              ) : (
                labor.map((ing) => (
                  <LedgerRow
                    key={ing.id}
                    ing={ing}
                    canWrite={canWrite}
                    onUpdate={(data) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, ...data })}
                    onDelete={() => deleteMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined })}
                  />
                ))
              )}
            </CategoryLedger>

            {/* 3. EQUIPMENT SECTION */}
            <CategoryLedger
              title="Equipment & Plant"
              icon={<Wrench className="h-3.5 w-3.5 text-emerald-500" />}
              subtotal={eqCost}
              collapsed={collapsedCategories["equipment"]}
              onToggle={() => toggleCategory("equipment")}
            >
              {equipment.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/60 italic py-1 px-2">No equipment resources added.</p>
              ) : (
                equipment.map((ing) => (
                  <LedgerRow
                    key={ing.id}
                    ing={ing}
                    canWrite={canWrite}
                    onUpdate={(data) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, ...data })}
                    onDelete={() => deleteMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined })}
                  />
                ))
              )}
            </CategoryLedger>

            {/* 4. OVERHEAD & PROFIT PROVISIONS */}
            <CategoryLedger
              title="Overhead & Profit Provisions"
              icon={<Percent className="h-3.5 w-3.5 text-purple-500" />}
              subtotal={pctCost + ovhFixedCost}
              collapsed={collapsedCategories["overhead"]}
              onToggle={() => toggleCategory("overhead")}
            >
              {percentage.length === 0 && overheadFixed.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/60 italic py-1 px-2">No overhead/profit provisions added.</p>
              ) : (
                <>
                  {overheadFixed.map((ing) => (
                    <LedgerRow
                      key={ing.id}
                      ing={ing}
                      canWrite={canWrite}
                      onUpdate={(data) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, ...data })}
                      onDelete={() => deleteMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined })}
                    />
                  ))}
                  {percentage.map((ing, idx) => {
                    let priorPctCost = 0;
                    for (let i = 0; i < idx; i++) {
                      const prev = percentage[i];
                      const prevBaseType = prev.pctBase ?? "all";
                      let prevBase = directCost;
                      if (prevBaseType === "material") prevBase = matCost;
                      else if (prevBaseType === "labor") prevBase = labCost;
                      else if (prevBaseType === "equipment") prevBase = eqCost;
                      else if (prevBaseType === "material_labor") prevBase = matCost + labCost;
                      else if (prevBaseType === "labor_equipment") prevBase = labCost + eqCost;
                      else if (prevBaseType === "all_including_pct") prevBase = directCost + priorPctCost;
                      else prevBase = directCost;
                      priorPctCost += (prevBase * (prev.percentage || 0)) / 100;
                    }

                    return (
                      <PercentageRow
                        key={ing.id}
                        ing={ing}
                        directCost={directCost}
                        matCost={matCost}
                        labCost={labCost}
                        eqCost={eqCost}
                        priorPctCost={priorPctCost}
                        canWrite={canWrite}
                        onUpdate={(data) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, ...data })}
                        onDelete={() => deleteMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined })}
                      />
                    );
                  })}
                </>
              )}
            </CategoryLedger>
          </>
        )}
      </div>

      {/* ─── QUICK ADD STRIP (COMPACT FOOTER BAR) ─── */}
      {canWrite && (
        <div className="p-2 border-t border-border/40 bg-muted/20 shrink-0 font-mono text-[11px]">
          {addingMode === "none" ? (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setAddingMode("material"); setNewUnit("cum"); }}
                className="flex-1 h-7 text-[10.5px] border-border/60 hover:bg-muted font-mono"
              >
                <Plus className="mr-1 h-3 w-3 text-blue-500" /> + Material
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setAddingMode("labor"); setNewUnit("md"); }}
                className="flex-1 h-7 text-[10.5px] border-border/60 hover:bg-muted font-mono"
              >
                <Plus className="mr-1 h-3 w-3 text-amber-500" /> + Labor
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setAddingMode("equipment"); setNewUnit("hr"); }}
                className="flex-1 h-7 text-[10.5px] border-border/60 hover:bg-muted font-mono"
              >
                <Plus className="mr-1 h-3 w-3 text-emerald-500" /> + Plant
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddingMode("overhead")}
                className="flex-1 h-7 text-[10.5px] border-border/60 hover:bg-muted font-mono"
              >
                <Plus className="mr-1 h-3 w-3 text-purple-500" /> + % OH&P
              </Button>
            </div>
          ) : addingMode === "overhead" ? (
            /* Percentage OH&P Quick Adder */
            <div className="p-2 rounded-lg bg-card border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                  <Percent className="h-3.5 w-3.5 text-purple-500" /> Add % Provision (Overhead / Profit)
                </span>
                <button
                  type="button"
                  onClick={() => setAddingMode("none")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                <input
                  type="text"
                  placeholder="Provision name (e.g. Contractor's Profit 15%)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full h-7 px-2 rounded bg-background border border-border/50 text-[11px] text-foreground font-mono"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-[10px] text-muted-foreground">%:</span>
                  <input
                    type="number"
                    step="any"
                    placeholder="15"
                    value={newPct}
                    onChange={(e) => setNewPct(e.target.value)}
                    className="w-16 h-7 px-2 rounded bg-background border border-border/50 text-[11px] text-foreground font-mono text-right"
                  />
                </div>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-[10px] text-muted-foreground">On:</span>
                  <select
                    value={newPctBase}
                    onChange={(e) => setNewPctBase(e.target.value)}
                    className="w-full h-7 rounded bg-background border border-border/50 px-2 text-[10px] text-foreground font-mono"
                  >
                    <option value="all">Direct Cost (M+L+E)</option>
                    <option value="material">Materials Only</option>
                    <option value="labor">Labor Only</option>
                    <option value="equipment">Equipment Only</option>
                    <option value="material_labor">Materials + Labor</option>
                  </select>
                </div>
                <Button
                  size="sm"
                  disabled={!newName.trim() || !newPct || addMutation.isPending}
                  onClick={() => {
                    addMutation.mutate({
                      itemId,
                      rateAnalysisId: analysisId || undefined,
                      name: newName.trim(),
                      type: "overhead",
                      calcMode: "percentage",
                      percentage: parseFloat(newPct) || 0,
                      pctBase: newPctBase,
                    });
                  }}
                  className="h-7 px-3 text-[11px] bg-primary text-primary-foreground font-mono shrink-0"
                >
                  {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add Provision"}
                </Button>
              </div>
            </div>
          ) : (
            /* Resource (Material / Labor / Equipment) Quick Adder */
            <div className="p-2 rounded-lg bg-card border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-foreground flex items-center gap-1 capitalize">
                  {addingMode === "material" && <Package className="h-3.5 w-3.5 text-blue-500" />}
                  {addingMode === "labor" && <Users className="h-3.5 w-3.5 text-amber-500" />}
                  {addingMode === "equipment" && <Wrench className="h-3.5 w-3.5 text-emerald-500" />}
                  Add {addingMode} Resource
                </span>
                <button
                  type="button"
                  onClick={() => { setAddingMode("none"); setSelectedCatalogItemId(""); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Resource Name Search */}
              <div>
                <IngredientPicker
                  value={newName}
                  onChange={handleIngredientSelect}
                  projectId={projectId}
                  resourceType={addingMode}
                  className="w-full"
                  placeholder={`Search ${addingMode} library...`}
                />
              </div>

              {/* Qty, Unit, Rate, Add */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Qty:</span>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="w-16 h-7 px-1.5 rounded bg-background border border-border/50 text-[11px] text-foreground font-mono text-right"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="h-7 rounded bg-background border border-border/50 px-1.5 text-[10px] text-foreground font-mono"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="text-[10px] text-muted-foreground">Rate:</span>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newName.trim() && newQty && newRate) {
                        addMutation.mutate({
                          itemId,
                          rateAnalysisId: analysisId || undefined,
                          name: newName.trim(),
                          type: addingMode,
                          calcMode: "fixed",
                          quantity: parseFloat(newQty) || 0,
                          unit: newUnit,
                          rate: parseFloat(newRate) || 0,
                          materialId: selectedResourceId || undefined,
                          catalogMaterialId: selectedCatalogItemId || undefined,
                        });
                      }
                    }}
                    className="w-full h-7 px-1.5 rounded bg-background border border-border/50 text-[11px] text-foreground font-mono text-right"
                  />
                </div>

                <Button
                  size="sm"
                  disabled={!newName.trim() || !newQty || !newRate || addMutation.isPending}
                  onClick={() => {
                    addMutation.mutate({
                      itemId,
                      rateAnalysisId: analysisId || undefined,
                      name: newName.trim(),
                      type: addingMode,
                      calcMode: "fixed",
                      quantity: parseFloat(newQty) || 0,
                      unit: newUnit,
                      rate: parseFloat(newRate) || 0,
                      materialId: selectedResourceId || undefined,
                      catalogMaterialId: selectedCatalogItemId || undefined,
                    });
                  }}
                  className="h-7 px-3 text-[11px] bg-primary text-primary-foreground font-mono shrink-0"
                >
                  {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SLIM BOTTOM FOOTER BAR ─── */}
      <div className="h-8 px-2.5 bg-card border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-muted-foreground shrink-0">
        <div className="flex items-center gap-1.5">
          <Calculator className="h-3 w-3 text-muted-foreground" />
          <span>Batch Total: <strong className="text-foreground">{formatNpr(totalBatchCost)}</strong></span>
          <span className="text-border">|</span>
          <span>Per {item.unit || "unit"}: <strong className="text-foreground">{formatNpr(ratePerUnit)}</strong></span>
        </div>

        {item.quantity > 0 && ingredients.length > 0 && (
          <div>
            <span>Total Item Demand: <strong className="text-foreground font-semibold">{formatNpr(ratePerUnit * item.quantity)}</strong></span>
          </div>
        )}
      </div>
    </aside>
  );
}

// Category ledger wrapper with toggle and subtotal chip
function CategoryLedger({
  title,
  icon,
  subtotal,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  subtotal: number;
  collapsed?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-2 py-1 bg-muted/30 hover:bg-muted/50 border-b border-border/30 flex items-center justify-between text-[11px] font-mono transition-colors"
      >
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          {collapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          {icon}
          <span>{title}</span>
        </div>
        <span className="text-[10.5px] font-medium text-foreground/80">{formatNpr(subtotal)}</span>
      </button>

      {!collapsed && (
        <div className="divide-y divide-border/20">
          {children}
        </div>
      )}
    </div>
  );
}

// Aligned Ledger Row Component for fixed resources
function LedgerRow({
  ing,
  canWrite,
  onUpdate,
  onDelete,
}: {
  ing: any;
  canWrite: boolean;
  onUpdate: (data: any) => void;
  onDelete: () => void;
}) {
  const isRateMissing = !ing.rate || ing.rate <= 0;
  const amount = (ing.quantity || 0) * (ing.rate || 0);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1.5 px-2 py-1 text-[11px] font-mono group hover:bg-muted/30 transition-colors",
        isRateMissing && "bg-amber-500/5"
      )}
    >
      {/* Resource Name */}
      <div className="flex-1 min-w-0 pr-1 flex items-center gap-1">
        <span className="text-foreground truncate" title={ing.name}>
          {ing.name}
        </span>
        {isRateMissing && (
          <span className="px-1 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[8.5px] font-bold shrink-0">
            Missing Rate
          </span>
        )}
      </div>

      {/* Editable Quantity & Unit */}
      <div className="flex items-center gap-1 shrink-0">
        {canWrite ? (
          <input
            type="number"
            step="any"
            defaultValue={ing.quantity}
            onBlur={(e) => {
              const val = parseFloat(e.target.value) || 0;
              if (val !== ing.quantity) onUpdate({ quantity: val });
            }}
            className="w-12 h-6 px-1 rounded bg-background border border-border/40 text-foreground text-right text-[10.5px] focus:outline-hidden focus:border-primary"
          />
        ) : (
          <span className="text-foreground">{ing.quantity}</span>
        )}
        <span className="w-8 text-[10px] text-muted-foreground truncate">{ing.unit}</span>
      </div>

      {/* Editable Rate */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-muted-foreground">@</span>
        {canWrite ? (
          <input
            type="number"
            step="any"
            defaultValue={ing.rate}
            onBlur={(e) => {
              const val = parseFloat(e.target.value) || 0;
              if (val !== ing.rate) onUpdate({ rate: val });
            }}
            className={cn(
              "w-16 h-6 px-1 rounded bg-background border text-right text-[10.5px] focus:outline-hidden focus:border-primary",
              isRateMissing ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "border-border/40 text-foreground"
            )}
          />
        ) : (
          <span className="text-foreground">{formatNpr(ing.rate)}</span>
        )}
      </div>

      {/* Line Total */}
      <div className="w-20 text-right shrink-0 font-semibold text-foreground text-[10.5px]">
        {formatNpr(amount)}
      </div>

      {/* Delete Action */}
      <div className="w-5 shrink-0 text-right">
        {canWrite && (
          <button
            type="button"
            onClick={onDelete}
            title="Remove resource"
            className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-rose-500 transition-opacity"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// Aligned Ledger Row Component for percentage provisions
function PercentageRow({
  ing,
  directCost,
  matCost,
  labCost,
  eqCost,
  priorPctCost = 0,
  canWrite,
  onUpdate,
  onDelete,
}: {
  ing: any;
  directCost: number;
  matCost: number;
  labCost: number;
  eqCost: number;
  priorPctCost?: number;
  canWrite: boolean;
  onUpdate: (data: any) => void;
  onDelete: () => void;
}) {
  let base = directCost;
  const b = ing.pctBase ?? "all";
  if (b === "material") base = matCost;
  else if (b === "labor") base = labCost;
  else if (b === "equipment") base = eqCost;
  else if (b === "material_labor") base = matCost + labCost;
  else if (b === "labor_equipment") base = labCost + eqCost;
  else if (b === "all_including_pct") base = directCost + priorPctCost;
  else base = directCost;

  const amount = (base * (ing.percentage || 0)) / 100;

  return (
    <div className="flex items-center justify-between gap-1.5 px-2 py-1 text-[11px] font-mono group hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0 pr-1">
        <span className="text-foreground truncate" title={ing.name}>
          {ing.name}
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0 text-[10px] text-muted-foreground">
        {canWrite ? (
          <div className="flex items-center gap-0.5">
            <input
              type="number"
              step="any"
              defaultValue={ing.percentage}
              onBlur={(e) => {
                const val = parseFloat(e.target.value) || 0;
                if (val !== ing.percentage) onUpdate({ percentage: val });
              }}
              className="w-10 h-6 px-1 rounded bg-background border border-border/40 text-foreground text-right text-[10.5px]"
            />
            <span>% on {b === "all" ? "direct" : b}</span>
          </div>
        ) : (
          <span>{ing.percentage}% on {b}</span>
        )}
      </div>

      <div className="w-20 text-right shrink-0 font-semibold text-foreground text-[10.5px]">
        {formatNpr(amount)}
      </div>

      <div className="w-5 shrink-0 text-right">
        {canWrite && (
          <button
            type="button"
            onClick={onDelete}
            title="Remove provision"
            className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-rose-500 transition-opacity"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
