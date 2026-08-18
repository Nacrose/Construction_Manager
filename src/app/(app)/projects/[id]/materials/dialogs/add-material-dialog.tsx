"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Sparkles, Layers } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";

// Industry sub-category presets mapped by category
const SUB_CATEGORY_PRESETS: Record<string, string[]> = {
  Aggregate: ["10mm", "20mm", "40mm", "Boulders"],
  Steel: ["8mm", "10mm", "12mm", "16mm", "20mm", "25mm", "32mm"],
  Rebar: ["8mm", "10mm", "12mm", "16mm", "20mm", "25mm", "32mm"],
  Cement: ["53 Grade OPC", "43 Grade OPC", "PPC"],
  Bricks: ["First Class Machine Made", "Fly Ash Bricks", "AAC Blocks"],
  Pipe: ["4 inch PVC", "6 inch HDPE", "PPR"],
  Electrical: ["1.5 sq mm", "2.5 sq mm", "4 sq mm"],
};

export function AddMaterialDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [materialCatalogId, setMaterialCatalogId] = useState<string | null>(null);
  const [unit, setUnit] = useState("cum");
  const [minStock, setMinStock] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");

  // Fetch Master Catalog items for quick direct selection
  const { data: catalogData } = trpc.materialCatalog.list.useQuery({ includeGlobal: true });

  const mutation = trpc.material.create.useMutation({
    onSuccess: () => {
      utils.material.list.invalidate({ projectId });
      toast.success("Material added successfully to project inventory!");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSelectCatalogItem = (catalogId: string) => {
    if (!catalogId) {
      setMaterialCatalogId(null);
      return;
    }
    const catItem = catalogData?.items.find((i) => i.id === catalogId);
    if (catItem) {
      setMaterialCatalogId(catItem.id);
      setName(catItem.name);
      if (catItem.category) setCategory(catItem.category);
      if (catItem.subCategory) setSubCategory(catItem.subCategory);
      if (catItem.defaultUnit) setUnit(catItem.defaultUnit);

      // Auto code suggestion
      const catPrefix = (catItem.category || "MAT").substring(0, 3).toUpperCase();
      const specSuffix = catItem.subCategory ? `-${catItem.subCategory.replace(/\s+/g, "").toUpperCase()}` : "";
      setCode(`${catPrefix}${specSuffix}`);
    }
  };

  const handleSelectPreset = (preset: string) => {
    setSubCategory(preset);
    if (category) {
      const catPrefix = category.substring(0, 3).toUpperCase();
      const specSuffix = `-${preset.replace(/\s+/g, "").toUpperCase()}`;
      setCode(`${catPrefix}${specSuffix}`);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      projectId,
      name,
      code: code.trim() || undefined,
      category: category.trim() || undefined,
      subCategory: subCategory.trim() || undefined,
      materialCatalogId: materialCatalogId || undefined,
      unit,
      minStock: parseFloat(minStock) || 0,
      currentStock: 0,
      reorderLevel: parseFloat(reorderLevel) || 0,
    });
  };

  // Find relevant sub-category chips based on selected Category
  const activeCategoryKey = Object.keys(SUB_CATEGORY_PRESETS).find(
    (k) => k.toLowerCase() === (category || "").toLowerCase()
  );
  const currentPresets = activeCategoryKey ? SUB_CATEGORY_PRESETS[activeCategoryKey] : [];

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="text-base font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-amber-500" />
          Add Material to Inventory & Catalog
        </DialogTitle>
        <DialogDescription className="text-xs">
          Select from the Master Item Catalog to auto-link BOQ rate analysis and inventory, or create a custom material.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Master Catalog Direct Selector */}
        <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-3 space-y-1.5">
          <Label className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Pick from Master Item Catalog (Bypasses Manual Linking)
          </Label>
          <select
            value={materialCatalogId || ""}
            onChange={(e) => handleSelectCatalogItem(e.target.value)}
            className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground shadow-sm focus:ring-1 focus:ring-amber-500"
          >
            <option value="">-- Choose Canonical Item from Catalog --</option>
            {catalogData?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.category ? `(${item.category})` : ""} {item.subCategory ? `— ${item.subCategory}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Material Name & Unit */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-semibold">Material Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aggregate 20mm / Rebar 12mm"
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Unit *</Label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. cum / ton / bag"
              className="h-8 text-xs"
              required
            />
          </div>
        </div>

        {/* Category & Sub-Category / Size */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Aggregate, Steel, Cement"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Sub-Category / Size / Spec</Label>
            <Input
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              placeholder="e.g. 20mm, 12mm, 53 Grade"
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Sub-Category Quick Preset Chips */}
        {currentPresets.length > 0 && (
          <div className="space-y-1 bg-muted/20 p-2.5 rounded-lg border text-xs">
            <span className="text-[10px] text-muted-foreground font-semibold block flex items-center gap-1">
              <Layers className="h-3 w-3 text-blue-500" /> Quick Size Presets for {category}:
            </span>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {currentPresets.map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => handleSelectPreset(preset)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all",
                    subCategory === preset
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-card hover:bg-muted text-foreground border-border"
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Code, Min Stock & Reorder Level */}
        <div className="grid grid-cols-3 gap-3 pt-1 border-t">
          <div className="space-y-1">
            <Label className="text-[11px]">Material Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. AGG-20MM"
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Minimum Stock</Label>
            <Input
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              type="number"
              step="any"
              placeholder="0"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Reorder Level</Label>
            <Input
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              type="number"
              step="any"
              placeholder="0"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button size="sm" type="submit" disabled={mutation.isPending || !name || !unit} className="bg-blue-600 hover:bg-blue-700 text-white">
            {mutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add to Inventory & Catalog
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
