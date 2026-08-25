"use client";

import {useState} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronRight, ChevronDown, Check, X, Loader2, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";

const UNITS = ["cum", "sqm", "no", "m", "kg", "ton", "set", "lot", "hrs", "bag", "day"];

const PCT_BASE_LABELS: Record<string, string> = {
  material: "Materials", labor: "Labor", equipment: "Equipment", overhead: "Overhead",
  material_labor: "Material + Labor", labor_equipment: "Labor + Equipment",
  all: "All (M+L+E+O)", all_including_pct: "All + % Provisions",
};

export default function GlobalPresetsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [newName, setNewName] = useState("");
  const [newSource, setNewSource] = useState("Custom");
  const [newCategory, setNewCategory] = useState("General");

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.globalPreset.list.useQuery({
    q: search || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  });

  const { data: detail, isLoading: detailLoading, error: detailError } = trpc.globalPreset.get.useQuery(
    { presetId: selected ?? "" },
    { enabled: !!selected }
  );

  const createMutation = trpc.globalPreset.create.useMutation({
    onSuccess: (d) => {
      utils.globalPreset.list.invalidate();
      toast.success("Preset created");
      setNewName("");
      setSelected(d.preset.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.globalPreset.delete.useMutation({
    onSuccess: () => {
      utils.globalPreset.list.invalidate();
      toast.success("Preset deleted");
      setSelected(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const categoriesMap = new Map<string, Array<{ id: string; name: string; source: string; category: string; description: string | null; _count?: { ingredients: number } }>>();
  data?.presets.forEach((p) => {
    const list = categoriesMap.get(p.category);
    if (list) { list.push(p); }
    else { categoriesMap.set(p.category, [p]); }
  });

  const categoryList = Array.from(categoriesMap.keys());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rate Analysis Presets</h1>
        <p className="text-sm text-muted-foreground">
          Global library of rate analysis ingredient sets. Load these into any BOQ item&apos;s rate analysis.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search presets&mldr;" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-xs" />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-8 rounded border bg-background px-2 text-xs"
        >
          <option value="all">All categories</option>
          {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New preset (e.g. RCC M30)" className="h-8 w-56 text-xs" onKeyDown={(e) => { if (e.key === "Enter" && newName) createMutation.mutate({ name: newName, source: newSource, category: newCategory }); }} />
        <Input value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="Source" className="h-8 w-28 text-xs" />
        <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Category" className="h-8 w-28 text-xs" />
        <Button size="sm" variant="outline" className="h-8 px-2" disabled={!newName || createMutation.isPending} onClick={() => createMutation.mutate({ name: newName, source: newSource, category: newCategory })}>
          {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <div className="space-y-6">
          {Array.from(categoriesMap.entries()).map(([category, presets]) => (
            <div key={category}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{category}</h3>
              <div className="space-y-2">
                {presets.map((p) => (
                  <div key={p.id}>
                    <Card className={selected === p.id ? "border-emerald-400" : ""}>
                      <CardContent className="flex items-center gap-3 p-3">
                        <button onClick={() => setSelected(selected === p.id ? null : p.id)} className="rounded p-1 hover:bg-muted">
                          {selected === p.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{p.name}</span>
                            <Badge variant="outline" className="text-xs">{p.source}</Badge>
                            <span className="text-xs text-muted-foreground">({p._count?.ingredients ?? 0} ingredients)</span>
                          </div>
                          {p.description && <p className="truncate text-xs text-muted-foreground">{p.description}</p>}
                        </div>
                        <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate({ presetId: p.id }); }} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </CardContent>
                    </Card>
                    {/* Inline preset editor — renders right below the selected card */}
                    {selected === p.id && (
                      <>
                        {detailLoading && (
                          <div className="flex items-center gap-2 p-4 pl-10">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Loading ingredients…</span>
                          </div>
                        )}
                        {detailError && (
                          <Card className="p-3 border-red-200 dark:border-red-900 ml-6">
                            <p className="text-xs text-red-600">Failed to load: {detailError.message}</p>
                          </Card>
                        )}
                        {detail && <PresetEditor preset={detail.preset} />}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {data?.presets.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No presets yet. Create one above.</p>
          )}
        </div>
      )}
    </div>
  );
}

function PresetEditor({ preset }: { preset: { id: string; name: string; source: string; category: string; description: string | null; batchSize: number; ingredients: Array<{ id: string; name: string; type: string; calcMode: string; quantity: number; unit: string; percentage: number; pctBase: string; rate: number; amount: number; sortOrder: number }> } }) {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState<"fixed" | "percentage">("fixed");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("material");
  const [newQty, setNewQty] = useState("");
  const [newPct, setNewPct] = useState("");
  const [newUnit, setNewUnit] = useState("cum");
  const [newRate, setNewRate] = useState("");
  const [newPctBase, setNewPctBase] = useState("all");
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState(preset.name);
  const [metaSource, setMetaSource] = useState(preset.source);
  const [metaCategory, setMetaCategory] = useState(preset.category);

  const addMutation = trpc.globalPreset.addIngredient.useMutation({
    onSuccess: () => {
      utils.globalPreset.get.invalidate({ presetId: preset.id });
      utils.globalPreset.list.invalidate();
      toast.success("Added");
      setNewName(""); setNewQty(""); setNewPct(""); setNewRate(""); setAdding(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.globalPreset.updateIngredient.useMutation({
    onSuccess: () => {
      utils.globalPreset.get.invalidate({ presetId: preset.id });
      utils.globalPreset.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.globalPreset.deleteIngredient.useMutation({
    onSuccess: () => {
      utils.globalPreset.get.invalidate({ presetId: preset.id });
      utils.globalPreset.list.invalidate();
      toast.success("Removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePresetMutation = trpc.globalPreset.update.useMutation({
    onSuccess: () => {
      utils.globalPreset.get.invalidate({ presetId: preset.id });
      utils.globalPreset.list.invalidate();
      toast.success("Preset updated");
      setEditingMeta(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const ingredients = preset.ingredients ?? [];
  const fixed = ingredients.filter((i) => i.calcMode !== "percentage");
  const pct = ingredients.filter((i) => i.calcMode === "percentage");
  const matTotal = fixed.filter((i) => i.type === "material").reduce((s, i) => s + i.amount, 0);
  const labTotal = fixed.filter((i) => i.type === "labor").reduce((s, i) => s + i.amount, 0);
  const eqpTotal = fixed.filter((i) => i.type === "equipment").reduce((s, i) => s + i.amount, 0);
  const ovhTotal = fixed.filter((i) => i.type === "overhead").reduce((s, i) => s + i.amount, 0);
  const totalAll = ingredients.reduce((s, i) => s + i.amount, 0);
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {editingMeta ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input value={metaName} onChange={(e) => setMetaName(e.target.value)} className="h-7 w-48 text-xs" />
              <Input value={metaSource} onChange={(e) => setMetaSource(e.target.value)} className="h-7 w-24 text-xs" placeholder="Source" />
              <Input value={metaCategory} onChange={(e) => setMetaCategory(e.target.value)} className="h-7 w-24 text-xs" placeholder="Category" />
              <Button size="sm" variant="ghost" className="h-7 px-1" disabled={updatePresetMutation.isPending} onClick={() => updatePresetMutation.mutate({ presetId: preset.id, name: metaName, source: metaSource, category: metaCategory })}>
                {updatePresetMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => setEditingMeta(false)}><X className="h-3 w-3" /></Button>
            </div>
          ) : (
            <>
              {preset.name}
              <Badge variant="outline">{preset.source}</Badge>
              <span className="text-xs text-muted-foreground">[{preset.category}]</span>
              <button onClick={() => { setEditingMeta(true); setMetaName(preset.name); setMetaSource(preset.source); setMetaCategory(preset.category); }} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                <Pencil className="h-3 w-3" />
              </button>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!adding && (
          <div className="mb-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setAdding(true); setAddMode("fixed"); }}><Plus className="mr-1 h-3 w-3" /> Fixed item</Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(true); setAddMode("percentage"); }}><Plus className="mr-1 h-3 w-3" /> % of subtotal</Button>
          </div>
        )}

        {ingredients.length === 0 && !adding ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No ingredients yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">Name</th>
                  <th className="p-2 font-medium">Type</th>
                  <th className="p-2 text-right font-medium">Qty</th>
                  <th className="p-2 text-right font-medium">W%</th>
                  <th className="p-2 font-medium">Unit</th>
                  <th className="p-2 text-right font-medium">Rate</th>
                  <th className="p-2 text-right font-medium">Amount</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {fixed.map((ing) => {
                  const qwp = ing.quantity + (ing.quantity * (ing.percentage || 0)) / 100;
                  return (
                    <tr key={ing.id} className="border-b hover:bg-muted/10">
                      <td className="p-2"><PEdit value={ing.name} onSave={(v) => updateMutation.mutate({ presetId: preset.id, ingredientId: ing.id, name: v })} className="w-28" /></td>
                      <td className="p-2"><select value={ing.type} onChange={(e) => updateMutation.mutate({ presetId: preset.id, ingredientId: ing.id, type: e.target.value })} className="h-7 w-20 rounded border bg-background px-1 text-xs capitalize"><option value="material">material</option><option value="labor">labor</option><option value="equipment">equipment</option><option value="overhead">overhead</option></select></td>
                      <td className="p-2 text-right"><PEdit value={String(ing.quantity)} type="number" onSave={(v) => updateMutation.mutate({ presetId: preset.id, ingredientId: ing.id, quantity: parseFloat(v) || 0 })} className="w-16 text-right" />{ing.percentage > 0 && <span className="block text-[9px] text-muted-foreground">&rarr;{qwp.toFixed(3)}</span>}</td>
                      <td className="p-2 text-right"><PEdit value={ing.percentage > 0 ? String(ing.percentage) : "0"} type="number" onSave={(v) => updateMutation.mutate({ presetId: preset.id, ingredientId: ing.id, percentage: parseFloat(v) || 0 })} className="w-12 text-right" /></td>
                      <td className="p-2"><select value={ing.unit} onChange={(e) => updateMutation.mutate({ presetId: preset.id, ingredientId: ing.id, unit: e.target.value })} className="h-7 w-16 rounded border bg-background px-1 text-xs">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></td>
                      <td className="p-2 text-right"><PEdit value={String(ing.rate)} type="number" onSave={(v) => updateMutation.mutate({ presetId: preset.id, ingredientId: ing.id, rate: parseFloat(v) || 0 })} className="w-24 text-right" /></td>
                      <td className="p-2 text-right font-medium">{fmt(ing.amount)}</td>
                      <td className="p-2"><button onClick={() => deleteMutation.mutate({ presetId: preset.id, ingredientId: ing.id })} className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-3 w-3" /></button></td>
                    </tr>
                  );
                })}
                {matTotal > 0 && <tr key="sub-mat" className="bg-muted/5"><td colSpan={6} className="p-2 text-right text-muted-foreground">Materials:</td><td className="p-2 text-right font-medium">{fmt(matTotal)}</td><td></td></tr>}
                {labTotal > 0 && <tr key="sub-lab" className="bg-muted/5"><td colSpan={6} className="p-2 text-right text-muted-foreground">Labor:</td><td className="p-2 text-right font-medium">{fmt(labTotal)}</td><td></td></tr>}
                {eqpTotal > 0 && <tr key="sub-eqp" className="bg-muted/5"><td colSpan={6} className="p-2 text-right text-muted-foreground">Equipment:</td><td className="p-2 text-right font-medium">{fmt(eqpTotal)}</td><td></td></tr>}
                {ovhTotal > 0 && <tr key="sub-ovh" className="bg-muted/5"><td colSpan={6} className="p-2 text-right text-muted-foreground">Overhead:</td><td className="p-2 text-right font-medium">{fmt(ovhTotal)}</td><td></td></tr>}
                {pct.map((ing) => (
                  <tr key={ing.id} className="border-b bg-amber-50/30 dark:bg-amber-950/10">
                    <td className="p-2"><PEdit value={ing.name} onSave={(v) => updateMutation.mutate({ presetId: preset.id, ingredientId: ing.id, name: v })} className="w-28" /></td>
                    <td className="p-2 text-amber-700">% prov</td>
                    <td className="p-2"></td>
                    <td className="p-2 text-right"><PEdit value={String(ing.percentage)} type="number" onSave={(v) => updateMutation.mutate({ presetId: preset.id, ingredientId: ing.id, percentage: parseFloat(v) || 0 })} className="w-12 text-right" /></td>
                    <td className="p-2" colSpan={2}><select value={ing.pctBase} onChange={(e) => updateMutation.mutate({ presetId: preset.id, ingredientId: ing.id, pctBase: e.target.value })} className="h-7 w-full rounded border bg-background px-1 text-xs">{Object.entries(PCT_BASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td className="p-2 text-right font-medium text-amber-700">{fmt(ing.amount)}</td>
                    <td className="p-2"><button onClick={() => deleteMutation.mutate({ presetId: preset.id, ingredientId: ing.id })} className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-3 w-3" /></button></td>
                  </tr>
                ))}
                {adding && (
                  <tr className="border-t-2 bg-emerald-50/50 dark:bg-emerald-950/20">
                    {addMode === "fixed" ? (
                      <>
                        <td className="p-2"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Cement" className="h-7 w-28 rounded border bg-background px-1 text-xs" autoFocus /></td>
                        <td className="p-2"><select value={newType} onChange={(e) => setNewType(e.target.value)} className="h-7 w-20 rounded border bg-background px-1 text-xs capitalize"><option value="material">material</option><option value="labor">labor</option><option value="equipment">equipment</option><option value="overhead">overhead</option></select></td>
                        <td className="p-2"><input value={newQty} onChange={(e) => setNewQty(e.target.value)} type="text" inputMode="decimal" placeholder="0" className="h-7 w-14 rounded border bg-background px-1 text-right text-xs" /></td>
                        <td className="p-2"><input value={newPct} onChange={(e) => setNewPct(e.target.value)} type="text" inputMode="decimal" placeholder="0" className="h-7 w-12 rounded border bg-background px-1 text-right text-xs" /></td>
                        <td className="p-2"><select value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="h-7 w-16 rounded border bg-background px-1 text-xs">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></td>
                        <td className="p-2"><input value={newRate} onChange={(e) => setNewRate(e.target.value)} type="text" inputMode="decimal" placeholder="0" className="h-7 w-24 rounded border bg-background px-1 text-right text-xs" /></td>
                        <td className="p-2 text-right text-muted-foreground">NPR {((parseFloat(newQty) || 0) * (1 + (parseFloat(newPct) || 0) / 100) * (parseFloat(newRate) || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      </>
                    ) : (
                      <>
                        <td className="p-2"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Contractor Profit" className="h-7 w-28 rounded border bg-background px-1 text-xs" autoFocus /></td>
                        <td className="p-2 text-amber-700">% prov</td>
                        <td className="p-2"></td>
                        <td className="p-2"><input value={newPct} onChange={(e) => setNewPct(e.target.value)} type="text" inputMode="decimal" placeholder="5" className="h-7 w-12 rounded border bg-background px-1 text-right text-xs" /></td>
                        <td className="p-2" colSpan={2}><select value={newPctBase} onChange={(e) => setNewPctBase(e.target.value)} className="h-7 w-full rounded border bg-background px-1 text-xs">{Object.entries(PCT_BASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                        <td className="p-2 text-right text-muted-foreground">auto</td>
                      </>
                    )}
                    <td className="p-2">
                      <div className="flex gap-1">
                        <button className="flex h-7 w-7 items-center justify-center rounded bg-emerald-600 text-white disabled:opacity-40" disabled={!newName || addMutation.isPending} onClick={() => {
                          if (addMode === "fixed") {
                            addMutation.mutate({ presetId: preset.id, name: newName, type: newType, calcMode: "fixed", quantity: parseFloat(newQty) || 0, percentage: parseFloat(newPct) || 0, unit: newUnit, rate: parseFloat(newRate) || 0 });
                          } else {
                            addMutation.mutate({ presetId: preset.id, name: newName, type: "overhead", calcMode: "percentage", percentage: parseFloat(newPct) || 0, pctBase: newPctBase });
                          }
                        }}><Check className="h-3 w-3" /></button>
                        <button className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted" onClick={() => { setAdding(false); setNewName(""); setNewQty(""); setNewPct(""); setNewRate(""); }}><X className="h-3 w-3" /></button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              {ingredients.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-emerald-50 dark:bg-emerald-950/30 font-bold">
                    <td colSpan={6} className="p-2 text-right">Total:</td>
                    <td className="p-2 text-right text-emerald-700 dark:text-emerald-400">NPR {fmt(totalAll)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PEdit({ value, onSave, type = "text", className }: { value: string; onSave: (v: string) => void; type?: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return <input autoFocus type={type === "number" ? "text" : type} inputMode={type === "number" ? "decimal" : undefined} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { setEditing(false); if (draft !== value) onSave(draft); }} onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); if (draft !== value) onSave(draft); } if (e.key === "Escape") { setDraft(value); setEditing(false); } }} className={`h-7 rounded border bg-background px-1 text-xs ${className} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} />;
  }
  return <span onClick={() => { setDraft(value); setEditing(true); }} className={`inline-block cursor-text rounded px-1 py-0.5 hover:bg-muted ${className}`}>{value || <span className="text-muted-foreground italic">&mdash;</span>}</span>;
}
