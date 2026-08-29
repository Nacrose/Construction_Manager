"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  { id: "client_estimate", name: "Client's Estimate", short: "Estimate", color: "text-emerald-400 border-emerald-500/40 bg-emerald-950/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]" },
  { id: "contractor_bid", name: "Contractor Bid", short: "Bid (Tender)", color: "text-amber-400 border-amber-500/40 bg-amber-950/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]" },
  { id: "contractor_actual", name: "Contractor's Actual", short: "Actual Cost", color: "text-cyan-400 border-cyan-500/40 bg-cyan-950/40 shadow-[0_0_10px_rgba(6,182,212,0.15)]" },
];

export function RateAnalysisInspector({
  item,
  projectId,
  canWrite,
  onClose,
}: RateAnalysisInspectorProps) {
  const utils = trpc.useUtils() as any;

  const [activePurpose, setActivePurpose] = useState<string>("client_estimate");
  const [addingMode, setAddingMode] = useState<"none" | "fixed" | "percentage">("none");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [savePresetName, setSavePresetName] = useState("");
  const [presetToLoad, setPresetToLoad] = useState("");

  // Rate catalog / district selection
  const [rateCatalogId, setRateCatalogId] = useState("");
  const [rateDistrict, setRateDistrict] = useState("");

  // New ingredient form states
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"material" | "labor" | "equipment" | "overhead">("material");
  const [newQty, setNewQty] = useState("");
  const [newPct, setNewPct] = useState("");
  const [newUnit, setNewUnit] = useState("cum");
  const [newRate, setNewRate] = useState("");
  const [newPctBase, setNewPctBase] = useState("all");
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState("");

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

  // 3. Fetch rate catalogs for district lookup (v2)
  const { data: catalogsData } = trpc.catalogV2.listRateCatalogs.useQuery({});
  const activeCatalog = catalogsData?.catalogs?.find((c) => c.id === rateCatalogId);
  const districts = activeCatalog?.districts ?? [];

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
      toast.success("Ingredient added");
      setNewName("");
      setNewQty("");
      setNewRate("");
      setNewPct("");
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
      toast.success("Ingredient removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateBatchMutation = trpc.rateAnalysis.update.useMutation({
    onSuccess: () => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
      utils.analysisLibrary.getItems.invalidate();
      toast.success("Batch size updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const loadPresetMutation = trpc.globalPreset.load.useMutation({
    onSuccess: (d) => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
      utils.analysisLibrary.getItems.invalidate();
      utils.boq.list.invalidate({ projectId });
      toast.success(`Loaded "${d.presetName}" (${d.loaded} ingredients)`);
      setPresetToLoad("");
    },
    onError: (e) => toast.error(e.message),
  });

  const savePresetMutation = trpc.globalPreset.saveFromAnalysis.useMutation({
    onSuccess: (d) => {
      utils.globalPreset.list.invalidate();
      toast.success(`Saved as preset "${d.preset.name}"`);
      setSavePresetName("");
      setShowSavePreset(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // Handle ingredient catalog / resource library selection
  function handleIngredientSelect(name: string, resource?: { id: string; name: string; unit: string; catalogMaterialId?: string | null }) {
    setNewName(name);
    setSelectedResourceId(resource?.id ?? "");
    setSelectedCatalogItemId(resource?.catalogMaterialId ?? "");
    if (resource?.unit) setNewUnit(resource.unit);
    // Try rate catalog district rate first (v2: catalogRates with material relation)
    const catId = resource?.catalogMaterialId;
    if (catId && catalogDetails?.catalog && rateDistrict) {
      const rateEntry = catalogDetails.catalog.catalogRates?.find(
        (r: any) => r.materialId === catId && r.district === rateDistrict
      );
      if (rateEntry && rateEntry.rate > 0) {
        setNewRate(String(rateEntry.rate));
        return;
      }
    }
  }

  const copyIngredientsMut = trpc.rateAnalysis.copyIngredients.useMutation({
    onSuccess: () => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId });
      utils.analysisLibrary.getItems.invalidate();
      toast.success("Copied ingredients from Client's Estimate");
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  // Copy from another analysis
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
    else if (b === "all") base = directCost;
    else base = directCost;
    const itemPctCost = (base * (i.percentage || 0)) / 100;
    pctCost += itemPctCost;
  });

  const totalBatchCost = directCost + pctCost;
  const ratePerUnit = batch > 0 ? totalBatchCost / batch : 0;
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const missingRateCount = fixed.filter((i) => !i.rate || i.rate <= 0).length;

  return (
    <aside
      className="w-full lg:w-[480px] shrink-0 border-l border-emerald-500/25 bg-[#080d0a]/95 flex flex-col h-[calc(100vh-140px)] z-20 shadow-[0_0_30px_rgba(0,0,0,0.8)] backdrop-blur-md overflow-hidden rounded-r-lg"
      aria-label="Rate Analysis Inspector"
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 1. Header: Item Identity & BoQ Contract Information */}
      <div className="p-3 border-b border-emerald-500/20 bg-emerald-950/20 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono text-[11px] font-bold border border-emerald-500/30">
                Item {item.code || "—"}
              </span>
              <span className="text-[10px] text-emerald-300/70 font-mono">
                {item.unit || "unit"} · {item.quantity.toLocaleString()} Qty
              </span>
              <Badge variant="outline" className="text-[9.5px] font-mono border-emerald-500/30 text-emerald-300 bg-emerald-950/40">
                Contract: NPR {fmt(item.rate)}
              </Badge>
            </div>
            <h2 className="text-xs font-semibold text-emerald-100 mt-1 leading-snug break-words">
              {item.description}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close Inspector (Esc)"
            className="p-1 rounded text-emerald-400/60 hover:text-emerald-200 hover:bg-emerald-950/60 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2. Library Purpose Tabs (Estimate / Bid / Actual) */}
        <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-emerald-500/15">
          {LIB_TABS.map((tab) => {
            const isActive = activePurpose === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePurpose(tab.id)}
                className={cn(
                  "flex-1 py-1 px-1.5 rounded text-[10.5px] font-mono font-medium transition-all text-center border",
                  isActive
                    ? tab.color + " font-bold"
                    : "border-transparent text-emerald-400/50 hover:text-emerald-300 hover:bg-emerald-950/30"
                )}
              >
                {tab.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Warning banner if rates are missing */}
      {missingRateCount > 0 && (
        <div className="px-3 py-1.5 bg-amber-950/40 border-b border-amber-500/30 text-[10.5px] text-amber-300 font-mono flex items-center gap-1.5 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span>
            {missingRateCount} resource(s) missing rate. Analysis unit rate may be underestimated.
          </span>
        </div>
      )}

      {/* 3. Norms Presets & District Catalog Toolbar */}
      <div className="px-3 py-1.5 border-b border-emerald-500/15 bg-[#050a07] flex flex-wrap items-center justify-between gap-1.5 shrink-0 text-xs">
        {/* Preset Loader */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
          <span className="text-[10px] text-emerald-400/70 font-mono shrink-0">Norms:</span>
          <div className="flex-1">
            <PresetCombobox
              presets={presetsData?.presets?.map((p: any) => ({
                id: p.id,
                name: p.name,
                source: p.category || p.source,
                ingredientCount: p._count?.ingredients,
              })) ?? []}
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
              placeholder="Load DoR / DUDBC Norms…"
              disabled={!canWrite || !analysisId || loadPresetMutation.isPending}
              popoverWidth={280}
            />
          </div>
        </div>

        {/* Copy from estimate button if on bid or actual */}
        {activePurpose !== "client_estimate" && canWrite && (
          <button
            type="button"
            onClick={handleCopyFromEstimate}
            title="Clone ingredients from Client's Estimate"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono transition-colors"
          >
            <Copy className="h-2.5 w-2.5" />
            <span>Copy Est</span>
          </button>
        )}

        {/* Save as Preset */}
        {canWrite && !showSavePreset && (
          <button
            type="button"
            onClick={() => setShowSavePreset(true)}
            title="Save current breakdown as reusable organization preset"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono transition-colors"
          >
            <Save className="h-2.5 w-2.5" />
            <span>Save Norm</span>
          </button>
        )}
      </div>

      {/* Save Preset Dialog Inline */}
      {showSavePreset && (
        <div className="p-2 mx-3 mt-1.5 rounded bg-[#050a07] border border-emerald-500/30 flex items-center gap-1.5 text-xs shrink-0">
          <input
            type="text"
            placeholder="Preset Name (e.g. DoR M20 Foundation)..."
            value={savePresetName}
            onChange={(e) => setSavePresetName(e.target.value)}
            className="flex-1 px-2 py-1 rounded bg-[#020503] border border-emerald-500/30 text-emerald-200 text-xs focus:outline-hidden focus:border-emerald-400"
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
            className="h-6 px-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {savePresetMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSavePreset(false)}
            className="h-6 px-1 text-xs text-emerald-400/60"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* 4. Ingredients Breakdown Body - Fixed Height with Matrix Scrollbar */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3.5 matrix-scrollbar">
        {ingLoading || analysesLoading ? (
          <div className="space-y-2 py-3">
            <Skeleton className="h-7 w-full bg-emerald-950/30" />
            <Skeleton className="h-16 w-full bg-emerald-950/20" />
            <Skeleton className="h-16 w-full bg-emerald-950/20" />
          </div>
        ) : (
          <>
            {/* Batch size configuration */}
            <div className="flex items-center justify-between p-2 rounded bg-emerald-950/15 border border-emerald-500/20 text-xs">
              <span className="text-emerald-300/80 font-mono text-[11px]">
                Analysis Batch Quantity:
              </span>
              <div className="flex items-center gap-1.5 font-mono">
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
                  className="w-16 px-1.5 py-0.5 rounded bg-[#020503] border border-emerald-500/40 text-emerald-200 text-right text-xs focus:outline-hidden focus:border-emerald-400"
                />
                <span className="text-emerald-400/70 text-xs">{item.unit || "unit"}</span>
              </div>
            </div>

            {/* Categorized Tables */}
            {/* MATERIALS */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono font-semibold text-emerald-400 border-b border-emerald-500/20 pb-0.5">
                <span className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Materials
                </span>
                <span className="text-emerald-400/70 text-[11px]">NPR {fmt(matCost)}</span>
              </div>
              {materials.length === 0 ? (
                <p className="text-[10.5px] text-emerald-500/40 italic py-0.5 pl-1">No material resources added.</p>
              ) : (
                <div className="space-y-1">
                  {materials.map((ing) => (
                    <IngredientRow
                      key={ing.id}
                      ing={ing}
                      canWrite={canWrite}
                      onUpdate={(data) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, ...data })}
                      onDelete={() => deleteMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* LABOR */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono font-semibold text-amber-400 border-b border-amber-500/20 pb-0.5">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Labor & Manpower
                </span>
                <span className="text-amber-400/70 text-[11px]">NPR {fmt(labCost)}</span>
              </div>
              {labor.length === 0 ? (
                <p className="text-[10.5px] text-emerald-500/40 italic py-0.5 pl-1">No labor resources added.</p>
              ) : (
                <div className="space-y-1">
                  {labor.map((ing) => (
                    <IngredientRow
                      key={ing.id}
                      ing={ing}
                      canWrite={canWrite}
                      onUpdate={(data) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, ...data })}
                      onDelete={() => deleteMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* EQUIPMENT */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono font-semibold text-teal-400 border-b border-teal-500/20 pb-0.5">
                <span className="flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Equipment & Machinery
                </span>
                <span className="text-teal-400/70 text-[11px]">NPR {fmt(eqCost)}</span>
              </div>
              {equipment.length === 0 ? (
                <p className="text-[10.5px] text-emerald-500/40 italic py-0.5 pl-1">No equipment resources added.</p>
              ) : (
                <div className="space-y-1">
                  {equipment.map((ing) => (
                    <IngredientRow
                      key={ing.id}
                      ing={ing}
                      canWrite={canWrite}
                      onUpdate={(data) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, ...data })}
                      onDelete={() => deleteMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* OVERHEADS & PROFIT */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono font-semibold text-purple-400 border-b border-purple-500/20 pb-0.5">
                <span className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5" /> Overheads & Profit
                </span>
                <span className="text-purple-400/70 text-[11px]">NPR {fmt(pctCost + ovhFixedCost)}</span>
              </div>
              {percentage.length === 0 && overheadFixed.length === 0 ? (
                <p className="text-[10.5px] text-emerald-500/40 italic py-0.5 pl-1">No overhead/profit provisions added.</p>
              ) : (
                <div className="space-y-1">
                  {overheadFixed.map((ing) => (
                    <IngredientRow
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
                      <PercentageIngredientRow
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
                </div>
              )}
            </div>

            {/* 5. Add Ingredient Buttons & Form */}
            {canWrite && (
              <div className="pt-2 border-t border-emerald-500/20">
                {addingMode === "none" ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddingMode("fixed")}
                      className="flex-1 h-7 text-xs border-emerald-500/30 bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-300"
                    >
                      <Plus className="mr-1 h-3 w-3 text-emerald-400" /> + Resource (Fixed)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddingMode("percentage")}
                      className="flex-1 h-7 text-xs border-purple-500/30 bg-purple-950/30 hover:bg-purple-900/50 text-purple-300"
                    >
                      <Plus className="mr-1 h-3 w-3 text-purple-400" /> + % Provision (OH&CP)
                    </Button>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-[#050a07] border border-emerald-500/30 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-200 text-[11px] font-mono">
                        {addingMode === "fixed" ? "Add Resource (Material / Labor / Plant)" : "Add % Provision (Overhead / Profit)"}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setAddingMode("none"); setSelectedCatalogItemId(""); }}
                        className="text-emerald-400/60 hover:text-emerald-200"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {addingMode === "fixed" ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-emerald-400/70 font-mono block mb-0.5">Type</label>
                            <select
                              value={newType}
                              onChange={(e) => setNewType(e.target.value as any)}
                              className="w-full h-7 rounded bg-[#020503] border border-emerald-500/30 px-2 text-xs text-emerald-200 font-mono"
                            >
                              <option value="material">📦 Material</option>
                              <option value="labor">👥 Labor</option>
                              <option value="equipment">🚜 Equipment</option>
                              <option value="overhead">💼 Overhead</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-emerald-400/70 font-mono block mb-0.5">Unit</label>
                            <select
                              value={newUnit}
                              onChange={(e) => setNewUnit(e.target.value)}
                              className="w-full h-7 rounded bg-[#020503] border border-emerald-500/30 px-2 text-xs text-emerald-200 font-mono"
                            >
                              {UNITS.map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-emerald-400/70 font-mono block mb-0.5">Resource Name</label>
                          <IngredientPicker
                            value={newName}
                            onChange={handleIngredientSelect}
                            projectId={projectId}
                            resourceType={newType as any}
                            className="w-full"
                            placeholder="Search Resource Library..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-emerald-400/70 font-mono block mb-0.5">Quantity (per batch)</label>
                            <input
                              type="number"
                              step="any"
                              placeholder="0.00"
                              value={newQty}
                              onChange={(e) => setNewQty(e.target.value)}
                              className="w-full h-7 px-2 rounded bg-[#020503] border border-emerald-500/30 text-xs text-emerald-200 font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-emerald-400/70 font-mono block mb-0.5">Rate (NPR / unit)</label>
                            <input
                              type="number"
                              step="any"
                              placeholder="0.00"
                              value={newRate}
                              onChange={(e) => setNewRate(e.target.value)}
                              className="w-full h-7 px-2 rounded bg-[#020503] border border-emerald-500/30 text-xs text-emerald-200 font-mono"
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="text-[10px] text-purple-400/70 font-mono block mb-0.5">Provision Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Contractor's Profit & Overhead (15%)"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="w-full h-7 px-2 rounded bg-[#020503] border border-purple-500/30 text-xs text-purple-200 font-mono"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-purple-400/70 font-mono block mb-0.5">Percentage (%)</label>
                            <input
                              type="number"
                              step="any"
                              placeholder="15"
                              value={newPct}
                              onChange={(e) => setNewPct(e.target.value)}
                              className="w-full h-7 px-2 rounded bg-[#020503] border border-purple-500/30 text-xs text-purple-200 font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-purple-400/70 font-mono block mb-0.5">Calculated On</label>
                            <select
                              value={newPctBase}
                              onChange={(e) => setNewPctBase(e.target.value)}
                              className="w-full h-7 rounded bg-[#020503] border border-purple-500/30 px-2 text-xs text-purple-200 font-mono"
                            >
                              <option value="all">Direct Cost (M+L+E)</option>
                              <option value="material">Materials Only</option>
                              <option value="labor">Labor Only</option>
                              <option value="equipment">Equipment Only</option>
                              <option value="material_labor">Materials + Labor</option>
                            </select>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setAddingMode("none"); setSelectedResourceId(""); setSelectedCatalogItemId(""); }}
                        className="h-6 px-2 text-xs text-emerald-400/60"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          !newName.trim() ||
                          (addingMode === "fixed" && (!newQty || !newRate)) ||
                          (addingMode === "percentage" && !newPct) ||
                          addMutation.isPending
                        }
                        onClick={() => {
                          if (addingMode === "fixed") {
                            addMutation.mutate({
                              itemId,
                              rateAnalysisId: analysisId || undefined,
                              name: newName.trim(),
                              type: newType,
                              calcMode: "fixed",
                              quantity: parseFloat(newQty) || 0,
                              unit: newUnit,
                              rate: parseFloat(newRate) || 0,
                              materialId: selectedResourceId || undefined,
                              catalogMaterialId: selectedCatalogItemId || undefined,
                            });
                          } else {
                            addMutation.mutate({
                              itemId,
                              rateAnalysisId: analysisId || undefined,
                              name: newName.trim(),
                              type: "overhead",
                              calcMode: "percentage",
                              percentage: parseFloat(newPct) || 0,
                              pctBase: newPctBase,
                            });
                          }
                        }}
                        className="h-6 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-mono"
                      >
                        {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add Resource"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 6. Footer: Calculated Rate & Total Resource Demands */}
      <div className="p-3 border-t border-emerald-500/20 bg-[#050a07] shrink-0 space-y-2">
        {/* Rate calculation summary card */}
        <div className="p-2 rounded-lg bg-emerald-950/25 border border-emerald-500/30 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1">
              <Calculator className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] font-mono text-emerald-400/70">Analysis Unit Rate:</span>
            </div>
            <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
              NPR {fmt(ratePerUnit)} <span className="text-[10.5px] font-normal text-emerald-300/60">/ {item.unit || "unit"}</span>
            </div>
          </div>

          {/* Independent BoQ rate comparison */}
          <div className="text-right">
            <span className="text-[9.5px] font-mono text-emerald-400/50 block">Contract BOQ Rate:</span>
            <span className="text-[11px] font-mono font-semibold text-emerald-200">
              NPR {fmt(item.rate)} / {item.unit || "unit"}
            </span>
          </div>
        </div>

        {/* Resource demand card for full quantity */}
        {item.quantity > 0 && ingredients.length > 0 && (
          <div className="text-[10px] font-mono text-emerald-300/80 bg-emerald-950/15 rounded px-2 py-1 border border-emerald-500/15 flex items-center justify-between">
            <span>Total Item Demand ({item.quantity.toLocaleString()} {item.unit}):</span>
            <span className="font-bold text-emerald-200">
              NPR {fmt(ratePerUnit * item.quantity)}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

// Subcomponent for fixed ingredient rows
function IngredientRow({
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
  const fmt = (n: number) => (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amount = (ing.quantity || 0) * (ing.rate || 0);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1.5 p-1.5 rounded bg-emerald-950/15 hover:bg-emerald-950/30 border border-emerald-500/15 text-xs font-mono group transition-colors",
        isRateMissing && "border-amber-500/35 bg-amber-500/5"
      )}
    >
      <div className="flex-1 min-w-0 pr-1">
        <div className="text-emerald-100 font-medium truncate text-[11px] flex items-center gap-1.5" title={ing.name}>
          <span>{ing.name}</span>
          {isRateMissing && (
            <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold">
              ⚠️ Missing Rate
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[9.5px] text-emerald-400/60 mt-0.5">
          {canWrite ? (
            <div className="flex items-center gap-1 flex-wrap">
              <span>Qty:</span>
              <input
                type="number"
                step="any"
                defaultValue={ing.quantity}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  if (val !== ing.quantity) onUpdate({ quantity: val });
                }}
                className="w-11 px-1 py-0.2 rounded bg-[#020503] border border-emerald-500/30 text-emerald-200 text-right text-[10px]"
              />
              <span>{ing.unit}</span>
              <span className="mx-0.5">@</span>
              <span>NPR</span>
              <input
                type="number"
                step="any"
                defaultValue={ing.rate}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  if (val !== ing.rate) onUpdate({ rate: val });
                }}
                className={cn(
                  "w-14 px-1 py-0.2 rounded bg-[#020503] border text-right text-[10px]",
                  isRateMissing
                    ? "border-amber-500/60 text-amber-300 bg-amber-950/30"
                    : "border-emerald-500/30 text-emerald-200"
                )}
              />
            </div>
          ) : (
            <span>
              {ing.quantity} {ing.unit} @ NPR {fmt(ing.rate)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-emerald-300 font-semibold text-[10.5px]">
          NPR {fmt(amount)}
        </span>
        {canWrite && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete ingredient"
            className="opacity-0 group-hover:opacity-100 p-0.5 text-emerald-400/50 hover:text-red-400 transition-opacity"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// Subcomponent for percentage provisions
function PercentageIngredientRow({
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
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    <div className="flex items-center justify-between gap-1.5 p-1.5 rounded bg-purple-950/15 hover:bg-purple-950/30 border border-purple-500/15 text-xs font-mono group transition-colors">
      <div className="flex-1 min-w-0 pr-1">
        <div className="text-purple-200 font-medium truncate text-[11px]" title={ing.name}>
          {ing.name}
        </div>
        <div className="flex items-center gap-1.5 text-[9.5px] text-purple-400/60 mt-0.5">
          {canWrite ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                defaultValue={ing.percentage}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  if (val !== ing.percentage) onUpdate({ percentage: val });
                }}
                className="w-10 px-1 py-0.2 rounded bg-[#020503] border border-purple-500/30 text-purple-200 text-right text-[10px]"
              />
              <span>% on {b}</span>
            </div>
          ) : (
            <span>
              {ing.percentage}% on {b}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-purple-300 font-semibold text-[10.5px]">
          NPR {fmt(amount)}
        </span>
        {canWrite && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete percentage provision"
            className="opacity-0 group-hover:opacity-100 p-0.5 text-purple-400/50 hover:text-red-400 transition-opacity"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
