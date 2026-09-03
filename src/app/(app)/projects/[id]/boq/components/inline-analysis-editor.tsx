"use client";

import {useState, Fragment} from "react";
import {useMutation} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc-client";
import {UNITS} from "../types";
import { InlineEdit } from "./inline-edit";
import { PresetCombobox } from "./preset-combobox";
import { IngredientPicker } from "@/components/rate-catalog/ingredient-picker";


export function InlineAnalysisEditor({ itemId, analysisId, projectId, itemUnit, canWrite }: { itemId: string; analysisId: string | null; projectId: string; itemUnit: string; canWrite: boolean }) {
  const utils = trpc.useUtils() as any;
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState<"fixed" | "percentage">("fixed");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("material");
  const [newQty, setNewQty] = useState("");
  const [newPct, setNewPct] = useState("");
  const [newUnit, setNewUnit] = useState("cum");
  const [newRate, setNewRate] = useState("");
  const [newPctBase, setNewPctBase] = useState("all");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [savePresetName, setSavePresetName] = useState("");
  const [presetToLoad, setPresetToLoad] = useState("");
  const [showAddToLibrary, setShowAddToLibrary] = useState(false);
  const [showCustomNameInput, setShowCustomNameInput] = useState(false);
  const [profileIdForNew, setProfileIdForNew] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState("");

  // Rate catalog state
  const [rateCatalogId, setRateCatalogId] = useState("");
  const [rateDistrict, setRateDistrict] = useState("");

  const { data: catalogsData } = trpc.catalogV2.listRateCatalogs.useQuery({});
  const activeCatalog = catalogsData?.catalogs?.find((c) => c.id === rateCatalogId);
  const districts = activeCatalog?.districts ?? [];

  const { data: catalogData } = trpc.catalogV2.getRateCatalog.useQuery(
    { id: rateCatalogId },
    { enabled: !!rateCatalogId },
  );

  // Auto-fill rate when ingredient is selected from Resource Library / Catalog (v2)
  function handleIngredientSelect(name: string, resource?: { id: string; name: string; unit: string; catalogMaterialId?: string | null }) {
    setNewName(name);
    setSelectedResourceId(resource?.id ?? "");
    setSelectedCatalogItemId(resource?.catalogMaterialId ?? "");
    if (resource?.unit) setNewUnit(resource.unit);
    // Try rate catalog district rate first (v2: catalogRates with material relation)
    const catId = resource?.catalogMaterialId;
    if (catId && catalogData?.catalog && rateDistrict) {
      const rateEntry = catalogData.catalog.catalogRates?.find(
        (r: any) => r.materialId === catId && r.district === rateDistrict
      );
      if (rateEntry && rateEntry.rate > 0) {
        setNewRate(String(rateEntry.rate));
        return;
      }
    }
  }

  const { data: profilesData } = trpc.rateProfile.list.useQuery({ projectId });

  const { data: allItemsData } = trpc.rateProfile.searchItems.useQuery(
    { projectId, search: newName || undefined },
    { enabled: !!projectId }
  );

  const allItems = allItemsData?.items ?? [];

  const [selectedProfile, setSelectedProfile] = useState("__all__");

  const dropdownItems = selectedProfile === "__all__"
    ? allItems
    : selectedProfile
      ? allItems.filter((i) => i.profileId === selectedProfile)
      : [];

  const { data: presetsData } = trpc.globalPreset.listOrg.useQuery({});

  const loadPresetMutation = trpc.globalPreset.load.useMutation({
    onSuccess: (d) => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
      utils.analysisLibrary.getItems.invalidate();
      utils.boq.list.invalidate({ projectId });
      toast.success(`Loaded "${d.presetName}" — ${d.loaded} ingredients`);
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

  const applyProfileMutation = trpc.rateProfile.batchApply.useMutation({
    onSuccess: (d) => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
      utils.boq.list.invalidate({ projectId });
      toast.success(`Applied rates: ${d.updated} of ${d.total} ingredients updated`);
    },
    onError: (e) => toast.error(e.message),
  });

  const { data, isLoading } = trpc.rateAnalysis.listIngredients.useQuery(
    { itemId, analysisId: analysisId! },
    { enabled: !!analysisId }
  );

  const addMutation = useMutation({
    mutationFn: async () => {
      const body: any = { itemId, name: newName };
      if (addMode === "fixed") {
        body.type = newType;
        body.calcMode = "fixed";
        body.quantity = parseFloat(newQty) || 0;
        body.percentage = parseFloat(newPct) || 0;
        body.unit = newUnit;
        body.rate = parseFloat(newRate) || 0;
        body.materialId = selectedResourceId || undefined;
        body.catalogMaterialId = selectedCatalogItemId || undefined;
      } else {
        body.type = "overhead";
        body.calcMode = "percentage";
        body.percentage = parseFloat(newPct) || 0;
        body.pctBase = newPctBase;
      }
      if (analysisId) {
        body.rateAnalysisId = analysisId;
      }

      return utils.rateAnalysis.addIngredient.mutateAsync(body);
    },
    onSuccess: () => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
      utils.analysisLibrary.getItems.invalidate();
      utils.boq.list.invalidate({ projectId });
      // If name doesn't match selected library, prompt to add it
      const nameMatch = dropdownItems.some((i) => i.materialName.toLowerCase().trim() === newName.toLowerCase().trim());
      if (!nameMatch && addMode === "fixed" && newName.trim() && profilesData && profilesData.profiles.length > 0) {
        setProfileIdForNew(selectedProfile && selectedProfile !== "__all__" ? selectedProfile : "");
        setShowAddToLibrary(true);
      } else {
        setNewName(""); setNewQty(""); setNewPct(""); setNewRate(""); setSelectedResourceId(""); setSelectedCatalogItemId(""); setAdding(false);
      }
      toast.success("Added");
    },
    onError: (e: any) => toast.error(e.message),
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
      toast.success("Removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateBatchMutation = trpc.rateAnalysis.update.useMutation({
    onSuccess: () => {
      utils.rateAnalysis.listIngredients.invalidate({ itemId, analysisId: analysisId! });
    },
    onError: (e) => toast.error(e.message),
  });

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

  if (!analysisId) return <p className="text-xs text-muted-foreground">No analysis found.</p>;
  if (isLoading) return <Skeleton className="h-24" />;

  const ingredients = data?.analysis.ingredients ?? [];
  const fixed = ingredients.filter((i) => i.calcMode !== "percentage");
  const pct = ingredients.filter((i) => i.calcMode === "percentage");
  const matT = fixed.filter((i) => i.type === "material").reduce((s, i) => s + i.amount, 0);
  const labT = fixed.filter((i) => i.type === "labor").reduce((s, i) => s + i.amount, 0);
  const eqpT = fixed.filter((i) => i.type === "equipment").reduce((s, i) => s + i.amount, 0);
  const ovhT = fixed.filter((i) => i.type === "overhead").reduce((s, i) => s + i.amount, 0);
  const total = ingredients.reduce((s, i) => s + i.amount, 0);
  const batch = data?.analysis.batchSize ?? 1;
  const ratePerUnit = batch > 0 ? total / batch : 0;

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b pb-2 text-xs">
        {catalogsData && catalogsData.catalogs.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-muted-foreground">Rate library:</span>
            <select value={rateCatalogId} onChange={(e) => { setRateCatalogId(e.target.value); setRateDistrict(""); }} className="h-6 rounded border bg-background px-1 text-xs max-w-[180px]">
              <option value="">— None —</option>
              {catalogsData.catalogs.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.fiscalYear}){c.isActive ? " ✓" : ""}</option>
              ))}
            </select>
            {rateCatalogId && districts.length > 0 && (
              <select value={rateDistrict} onChange={(e) => setRateDistrict(e.target.value)} className="h-6 rounded border bg-background px-1 text-xs">
                <option value="">District…</option>
                {districts.map((d: string) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </div>
        )}

        {presetsData && presetsData.presets.length > 0 && canWrite && (
          <div className="flex items-center gap-1 border-l pl-2">
            <span className="text-xs font-medium text-amber-600">Presets:</span>
            <div className="w-56">
              <PresetCombobox
                presets={presetsData.presets.map((p) => ({
                  id: p.id,
                  name: p.name,
                  source: p.source,
                  ingredientCount: p._count?.ingredients,
                }))}
                selected={presetToLoad}
                onSelect={setPresetToLoad}
                placeholder="Select preset…"
              />
            </div>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!presetToLoad || loadPresetMutation.isPending} onClick={() => { if (confirm("This will replace all existing ingredients with the preset values. Continue?")) loadPresetMutation.mutate({ presetId: presetToLoad, rateAnalysisId: analysisId, boqItemId: itemId, projectId, rateCatalogId: rateCatalogId || undefined, district: rateDistrict || undefined }); }}>
              {loadPresetMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin"/> : "Load Preset"} {rateDistrict ? `(${rateDistrict})` : ""}
            </Button>
          </div>
        )}

        {ingredients.length > 0 && canWrite && (
          <div className="flex items-center gap-1 border-l pl-2">
            {!showSavePreset ? (
              <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => setShowSavePreset(true)}>Save as preset →</Button>
            ) : (
              <>
                <input value={savePresetName} onChange={(e) => setSavePresetName(e.target.value)} placeholder="Preset name" className="h-6 w-28 rounded border bg-background px-1 text-xs"/>
                <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" disabled={!savePresetName || savePresetMutation.isPending} onClick={() => savePresetMutation.mutate({ rateAnalysisId: analysisId, presetName: savePresetName, source: "Custom", category: "General" })}>
                  {savePresetMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin"/> : <Check className="h-3 w-3"/>}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setShowSavePreset(false)}><X className="h-3 w-3"/></Button>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 border-l pl-2 ml-auto">
          <span className="text-muted-foreground">Batch:</span>
          <input
            key={`batch-${batch}`}
            type="text" inputMode="decimal" defaultValue={String(batch)}
            onBlur={(e) => updateBatchMutation.mutate({ itemId, analysisId, batchSize: parseFloat(e.target.value) || 1 })}
            className="w-14 rounded border bg-background px-1 py-0.5 text-right text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0"
          />
          <span className="text-muted-foreground">{itemUnit}</span>
          <span className="font-bold text-success dark:text-success/80">
            NPR {fmt(ratePerUnit)} / {itemUnit}
          </span>
        </div>
      </div>

      {showAddToLibrary && (
        <div className="mb-2 flex items-center gap-2 rounded border bg-amber-50 px-3 py-1.5 dark:bg-amber-950/20">
          <span className="text-xs text-muted-foreground">
            Add "<strong>{newName}</strong>" to a rate library?
          </span>
          <select
            value={profileIdForNew}
            onChange={(e) => setProfileIdForNew(e.target.value)}
            className="h-6 rounded border bg-background px-1 text-xs"
          >
            <option value="">— Select —</option>
            {profilesData?.profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Button
            size="sm" variant="ghost" className="h-6 px-1 text-xs bg-success text-white hover:bg-success"
            disabled={!profileIdForNew}
            onClick={async () => {
              await utils.rateProfile.addItem.mutateAsync({
                projectId, profileId: profileIdForNew,
                materialName: newName, unit: newUnit, rate: parseFloat(newRate) || 0,
              });
              utils.rateProfile.searchItems.invalidate({ projectId });
              toast.success(`Added "${newName}" to ${profilesData?.profiles.find((p) => p.id === profileIdForNew)?.name ?? "library"}`);
              setShowAddToLibrary(false);
              setProfileIdForNew("");
        setNewName(""); setNewQty(""); setNewPct(""); setNewRate(""); setSelectedCatalogItemId(""); setAdding(false);
            }}
          >
            + Add
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => { setShowAddToLibrary(false); setNewName(""); setNewQty(""); setNewPct(""); setNewRate(""); setAdding(false); }}>
            Skip
          </Button>
        </div>
      )}

      {!adding && canWrite && (
        <div className="mb-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setAdding(true); setAddMode("fixed"); }}><Plus className="mr-1 h-3 w-3"/> Fixed</Button>
          <Button size="sm" variant="outline" onClick={() => { setAdding(true); setAddMode("percentage"); }}><Plus className="mr-1 h-3 w-3"/> % provision</Button>
        </div>
      )}

      {ingredients.length === 0 && !adding ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No ingredients. Add materials, labor, or equipment.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="pb-1 pr-2 font-medium">Name</th>
              <th className="pb-1 pr-2 font-medium">Type</th>
              <th className="pb-1 pr-2 text-right font-medium">Qty</th>
              <th className="pb-1 pr-2 font-medium">Unit</th>
              <th className="pb-1 pr-2 text-right font-medium">Rate</th>
              <th className="pb-1 pr-2 text-right font-medium">Amount</th>
              {canWrite && <th className="pb-1 w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {fixed.map((ing) => {
              const qwp = ing.quantity + (ing.quantity * (ing.percentage || 0)) / 100;
              return (
                <tr key={ing.id} className="border-b last:border-0">
                  <td className="py-1 pr-2">
                    {canWrite ? (
                      <>
                        <select
                          value={ing.name}
                          onChange={(e) => {
                            const match = dropdownItems.find((i) => i.materialName === e.target.value);
                            const body: any = { itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, name: e.target.value };
                            if (match && match.source === "profile") {
                              body.unit = match.unit;
                              body.rate = match.rate;
                            }
                            updateMutation.mutate(body);
                          }}
                          className="h-6 w-36 rounded border bg-background px-1 text-xs"
                        >
                          <option value={ing.name}>
                            {ing.name} ({ing.unit} · NPR {ing.rate.toLocaleString("en-IN")})
                            {(() => {
                              const m = dropdownItems.find((i) => i.materialName === ing.name);
                              return m ? ` [${m.profileName}]` : "";
                            })()}
                          </option>
                          {dropdownItems.filter((i) => i.materialName !== ing.name).map((item) => (
                            <option key={item.materialName} value={item.materialName}>{item.materialName} ({item.unit} · NPR {item.rate.toLocaleString("en-IN")}) [{item.profileName}]</option>
                          ))}
                        </select>
{canWrite && selectedProfile && selectedProfile !== "__all__" && !dropdownItems.some((i) => i.materialName === ing.name) && (
                          <button
                            onClick={() => {
                              utils.rateProfile.addItem.mutate({
                                projectId, profileId: selectedProfile,
                                materialName: ing.name, unit: ing.unit, rate: ing.rate,
                              });
                              utils.rateProfile.searchItems.invalidate({ projectId });
                              toast.success(`Added "${ing.name}" to library`);
                            }}
                            className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded border border-success text-xs font-bold text-success hover:bg-success/10 hover:border-success"
                            title="Add to selected rate library"
                          >+</button>
                        )}
                      </>
                    ) : ing.name}
                  </td>
                  <td className="py-1 pr-2">{canWrite ? <select value={ing.type} onChange={(e) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, type: e.target.value as any })} className="h-6 w-20 rounded border bg-background px-1 text-xs capitalize"><option value="material">material</option><option value="labor">labor</option><option value="equipment">equipment</option><option value="overhead">overhead</option></select> : <span className="capitalize text-muted-foreground">{ing.type}</span>}</td>
                  <td className="py-1 pr-2 text-right">{canWrite ? <InlineEdit value={String(ing.quantity)} type="number" onSave={(v) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, quantity: parseFloat(v) || 0 })} className="w-14 text-right"/> : ing.quantity}{ing.percentage > 0 && <span className="block text-[9px] text-muted-foreground">→{qwp.toFixed(3)}</span>}</td>
                  <td className="py-1 pr-2">{canWrite ? <select value={ing.unit} onChange={(e) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, unit: e.target.value })} className="h-6 w-14 rounded border bg-background px-1 text-xs">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select> : ing.unit}</td>
                  <td className="py-1 pr-2 text-right">{canWrite ? <InlineEdit value={String(ing.rate)} type="number" onSave={(v) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, rate: parseFloat(v) || 0 })} className="w-20 text-right"/> : fmt(ing.rate)}</td>
                  <td className="py-1 pr-2 text-right font-medium">{fmt(ing.amount)}</td>
                  {canWrite && <td className="py-1"><button onClick={() => deleteMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined })} className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-3 w-3"/></button></td>}
                </tr>
              );
            })}
            {matT > 0 && <tr key="sub-mat" className="bg-muted/5"><td colSpan={canWrite ? 6 : 5} className="py-0.5 pr-2 text-right text-muted-foreground">Materials:</td><td className="py-0.5 pr-2 text-right font-medium">{fmt(matT)}</td>{canWrite && <td></td>}</tr>}
            {labT > 0 && <tr key="sub-lab" className="bg-muted/5"><td colSpan={canWrite ? 6 : 5} className="py-0.5 pr-2 text-right text-muted-foreground">Labor:</td><td className="py-0.5 pr-2 text-right font-medium">{fmt(labT)}</td>{canWrite && <td></td>}</tr>}
            {eqpT > 0 && <tr key="sub-eqp" className="bg-muted/5"><td colSpan={canWrite ? 6 : 5} className="py-0.5 pr-2 text-right text-muted-foreground">Equipment:</td><td className="py-0.5 pr-2 text-right font-medium">{fmt(eqpT)}</td>{canWrite && <td></td>}</tr>}
            {ovhT > 0 && <tr key="sub-ovh" className="bg-muted/5"><td colSpan={canWrite ? 6 : 5} className="py-0.5 pr-2 text-right text-muted-foreground">Overhead:</td><td className="py-0.5 pr-2 text-right font-medium">{fmt(ovhT)}</td>{canWrite && <td></td>}</tr>}
            {pct.map((ing) => (
              <tr key={ing.id} className="border-b bg-amber-50/30 dark:bg-amber-950/10">
                <td className="py-1 pr-2">
                  {canWrite ? (
                    <>
                      <select
                        value={ing.name}
                        onChange={(e) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, name: e.target.value })}
                        className="h-6 w-36 rounded border bg-background px-1 text-xs"
                      >
                        <option value={ing.name}>
                          {ing.name}
                          {(() => {
                            const m = dropdownItems.find((i) => i.materialName === ing.name);
                            return m ? ` (${m.unit} · NPR ${m.rate.toLocaleString("en-IN")}) [${m.profileName}]` : "";
                          })()}
                        </option>
                        {dropdownItems.filter((i) => i.materialName !== ing.name).map((item) => (
                          <option key={item.materialName} value={item.materialName}>{item.materialName} ({item.unit} · NPR {item.rate.toLocaleString("en-IN")}) [{item.profileName}]</option>
                        ))}
                      </select>
                      {canWrite && selectedProfile && selectedProfile !== "__all__" && !dropdownItems.some((i) => i.materialName === ing.name) && (
                        <button
                          onClick={() => {
                            utils.rateProfile.addItem.mutate({
                              projectId, profileId: selectedProfile,
                              materialName: ing.name, unit: ing.unit, rate: ing.rate,
                            });
                            utils.rateProfile.searchItems.invalidate({ projectId });
                            toast.success(`Added "${ing.name}" to library`);
                          }}
                          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded border border-success text-xs font-bold text-success hover:bg-success/10 hover:border-success"
                          title="Add to selected rate library"
                        >+</button>
                      )}
                    </>
                  ) : ing.name}
                </td>
                <td className="py-1 pr-2 text-amber-700">% prov</td>
                <td className="py-1 pr-2"></td>
                <td className="py-1 pr-2 text-right">{canWrite ? <InlineEdit value={String(ing.percentage)} type="number" onSave={(v) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, percentage: parseFloat(v) || 0 })} className="w-10 text-right"/> : `${ing.percentage}%`}</td>
                <td className="py-1 pr-2" colSpan={2}>{canWrite ? <select value={ing.pctBase} onChange={(e) => updateMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined, pctBase: e.target.value })} className="h-6 w-full rounded border bg-background px-1 text-xs">{Object.entries({ material: "Materials", labor: "Labor", equipment: "Equipment", material_labor: "M+L", labor_equipment: "L+E", all: "All", all_including_pct: "All+%" }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : <span className="text-muted-foreground">{ing.pctBase}</span>}</td>
                <td className="py-1 pr-2 text-right font-medium text-amber-700">{fmt(ing.amount)}</td>
                {canWrite && <td className="py-1"><button onClick={() => deleteMutation.mutate({ itemId, ingredientId: ing.id, rateAnalysisId: analysisId || undefined })} className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-3 w-3"/></button></td>}
              </tr>
            ))}
            {adding && canWrite && (
              <tr className="border-t-2 bg-success dark:bg-success/20">
                {addMode === "fixed" ? (
                  <>
                    <td className="py-1 pr-2">
                      <IngredientPicker
                        value={newName}
                        onChange={handleIngredientSelect}
                        projectId={projectId}
                        resourceType={newType as any}
                        placeholder="Search Resource Library..."
                        className="w-36"
                      />
                      {showCustomNameInput && (
                        <button
                          className="ml-1 text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => { setShowCustomNameInput(false); setNewName(""); }}
                        >
                          ← back
                        </button>
                      )}
                    </td>
                    <td className="py-1 pr-2"><select value={newType} onChange={(e) => setNewType(e.target.value)} className="h-6 w-20 rounded border bg-background px-1 text-xs capitalize"><option value="material">material</option><option value="labor">labor</option><option value="equipment">equipment</option><option value="overhead">overhead</option></select></td>
                    <td className="py-1 pr-2"><input value={newQty} onChange={(e) => setNewQty(e.target.value)} type="text" inputMode="decimal" placeholder="0" className="h-6 w-14 rounded border bg-background px-1 text-right text-xs"/></td>
                    <td className="py-1 pr-2"><select value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="h-6 w-14 rounded border bg-background px-1 text-xs">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></td>
                    <td className="py-1 pr-2"><input value={newRate} onChange={(e) => setNewRate(e.target.value)} type="text" inputMode="decimal" placeholder="0" className="h-6 w-20 rounded border bg-background px-1 text-right text-xs"/></td>
                    <td className="py-1 pr-2 text-right text-muted-foreground">NPR {((parseFloat(newQty) || 0) * (1 + (parseFloat(newPct) || 0) / 100) * (parseFloat(newRate) || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </>
                ) : (
                  <>
                    <td className="py-1 pr-2"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Contractor Profit" className="h-6 w-24 rounded border bg-background px-1 text-xs" autoFocus/></td>
                    <td className="py-1 pr-2 text-amber-700">% prov</td>
                    <td className="py-1 pr-2"></td>
                    <td className="py-1 pr-2 text-right"><input value={newPct} onChange={(e) => setNewPct(e.target.value)} type="text" inputMode="decimal" placeholder="5" className="h-6 w-10 rounded border bg-background px-1 text-right text-xs"/></td>
                    <td className="py-1 pr-2" colSpan={2}><select value={newPctBase} onChange={(e) => setNewPctBase(e.target.value)} className="h-6 w-full rounded border bg-background px-1 text-xs">{Object.entries({ material: "Materials", labor: "Labor", equipment: "Equipment", material_labor: "M+L", labor_equipment: "L+E", all: "All", all_including_pct: "All+%" }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td className="py-1 pr-2 text-right text-muted-foreground">auto</td>
                  </>
                )}
                <td className="py-1">
                  <div className="flex gap-1">
                    <button className="flex h-6 w-6 items-center justify-center rounded bg-success text-white disabled:opacity-40" disabled={!newName || addMutation.isPending} onClick={() => addMutation.mutate()}><Check className="h-3 w-3"/></button>
                    <button className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted" onClick={() => { setAdding(false); setNewName(""); setNewQty(""); setNewPct(""); setNewRate(""); setSelectedCatalogItemId(""); }}><X className="h-3 w-3"/></button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          {ingredients.length > 0 && (
            <tfoot>
              <tr className="border-t font-bold">
                <td colSpan={canWrite ? 6 : 5} className="py-1 pr-2 text-right">Total for {batch} {itemUnit}:</td>
                <td className="py-1 pr-2 text-right text-success dark:text-success/80">NPR {fmt(total)}</td>
                {canWrite && <td></td>}
              </tr>
              <tr className="font-bold">
                <td colSpan={canWrite ? 6 : 5} className="py-1 pr-2 text-right">Rate per {itemUnit}:</td>
                <td className="py-1 pr-2 text-right text-success dark:text-success/80">NPR {fmt(ratePerUnit)}</td>
                {canWrite && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}
