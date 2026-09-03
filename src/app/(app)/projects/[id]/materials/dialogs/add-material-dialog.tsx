"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Sparkles, Layers, Package, Users, Wrench } from "lucide-react";
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

export function AddMaterialDialog({
  projectId,
  initialType = "material",
  onDone,
}: {
  projectId: string;
  initialType?: "material" | "labor" | "equipment";
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [resourceType, setResourceType] = useState<"material" | "labor" | "equipment">(initialType);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [materialCatalogId, setMaterialCatalogId] = useState<string | null>(null);
  const [unit, setUnit] = useState(initialType === "labor" ? "day" : initialType === "equipment" ? "hr" : "cum");
  const [minStock, setMinStock] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [openingRate, setOpeningRate] = useState("");

  // Fetch Master Catalog items filtered by resourceType
  const { data: catalogData } = trpc.catalogV2.listMaterials.useQuery({
    scope: "org",
    resourceType,
    limit: 500,
  });

  const mutation = trpc.material.create.useMutation({
    onSuccess: () => {
      utils.material.list.invalidate({ projectId });
      utils.material.listByType.invalidate();
      toast.success("Resource added successfully to project Resource Library!");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSelectCatalogItem = (catalogId: string) => {
    if (!catalogId) {
      setMaterialCatalogId(null);
      return;
    }
    const items = catalogData?.materials || [];
    const catItem = items.find((i: any) => i.id === catalogId);
    if (catItem) {
      setMaterialCatalogId(catItem.id);
      setName(catItem.name);
      if (catItem.category) setCategory(catItem.category);
      if (catItem.subCategory) setSubCategory(catItem.subCategory);
      if (catItem.defaultUnit) setUnit(catItem.defaultUnit);

      // Auto code suggestion
      const catPrefix = (catItem.category || resourceType.substring(0, 3)).substring(0, 3).toUpperCase();
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

  const handleTypeChange = (type: "material" | "labor" | "equipment") => {
    setResourceType(type);
    setMaterialCatalogId(null);
    if (type === "labor") setUnit("day");
    else if (type === "equipment") setUnit("hr");
    else setUnit("cum");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      projectId,
      resourceType,
      name: name.trim(),
      code: code.trim() || undefined,
      category: category.trim() || undefined,
      subCategory: subCategory.trim() || undefined,
      catalogMaterialId: materialCatalogId || undefined,
      unit: unit.trim(),
      minStock: resourceType === "material" ? parseFloat(minStock) || 0 : 0,
      currentStock: 0,
      openingStock: resourceType === "material" ? parseFloat(openingStock) || 0 : 0,
      openingRate: resourceType === "material" ? parseFloat(openingRate) || 0 : 0,
      reorderLevel: resourceType === "material" ? parseFloat(reorderLevel) || 0 : 0,
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
          Add Resource to Project Library
        </DialogTitle>
        <DialogDescription className="text-xs">
          Select from the Master Catalog or create a project-specific resource.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Resource Type Tabs */}
        <div className="flex rounded-lg bg-muted p-1 gap-1">
          <button
            type="button"
            onClick={() => handleTypeChange("material")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all",
              resourceType === "material"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Package className="h-3.5 w-3.5" />
            Material
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange("labor")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all",
              resourceType === "labor"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Labor
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange("equipment")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all",
              resourceType === "equipment"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Wrench className="h-3.5 w-3.5" />
            Equipment
          </button>
        </div>

        {/* Master Catalog Direct Selector */}
        <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-3 space-y-1.5">
          <Label className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Pick from Master Catalog ({resourceType})
          </Label>
          <select
            value={materialCatalogId || ""}
            onChange={(e) => handleSelectCatalogItem(e.target.value)}
            className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground shadow-sm focus:ring-1 focus:ring-amber-500"
          >
            <option value="">-- Choose Canonical {resourceType.toUpperCase()} from Catalog --</option>
            {(catalogData?.materials || []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.category ? `(${item.category})` : ""} {item.subCategory ? `— ${item.subCategory}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Resource Name & Unit */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-semibold">Resource Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                resourceType === "labor"
                  ? "e.g. Skilled Mason / Carpenter"
                  : resourceType === "equipment"
                  ? "e.g. Excavator 20-Ton / Concrete Mixer"
                  : "e.g. Aggregate 20mm / Rebar 12mm"
              }
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Unit *</Label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={resourceType === "labor" ? "day" : resourceType === "equipment" ? "hr" : "cum"}
              className="h-8 text-xs font-mono"
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
              placeholder={
                resourceType === "labor"
                  ? "e.g. Civil, Mechanical, Electrical"
                  : resourceType === "equipment"
                  ? "e.g. Earthmoving, Concreting, Hauling"
                  : "e.g. Aggregate, Steel, Cement"
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">
              {resourceType === "labor" ? "Skill Level / Trade" : resourceType === "equipment" ? "Capacity / Spec" : "Sub-Category / Spec"}
            </Label>
            <Input
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              placeholder={
                resourceType === "labor"
                  ? "e.g. Grade A, Helper"
                  : resourceType === "equipment"
                  ? "e.g. 0.9 cum bucket, 10-Ton"
                  : "e.g. 20mm, 12mm, 53 Grade"
              }
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Sub-Category Quick Preset Chips for Materials */}
        {resourceType === "material" && currentPresets.length > 0 && (
          <div className="space-y-1 bg-muted/20 p-2.5 rounded-lg border text-xs">
            <span className="text-[10px] text-muted-foreground font-semibold block flex items-center gap-1">
              <Layers className="h-3 w-3 text-info" /> Quick Size Presets for {category}:
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
                      ? "bg-info text-white border-info shadow-xs"
                      : "bg-card hover:bg-muted text-foreground border-border"
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Code & Inventory Stock Fields (Only for Materials) */}
        <div className={cn("grid gap-3 pt-1 border-t", resourceType === "material" ? "grid-cols-3" : "grid-cols-1")}>
          <div className="space-y-1">
            <Label className="text-[11px]">Resource Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={
                resourceType === "labor"
                  ? "e.g. LAB-MASON"
                  : resourceType === "equipment"
                  ? "e.g. EQP-EXCAV"
                  : "e.g. AGG-20MM"
              }
              className="h-8 text-xs font-mono"
            />
          </div>

          {resourceType === "material" && (
            <>
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
            </>
          )}
        </div>

        {/* Opening Stock & Valuation (Only for Materials) */}
        {resourceType === "material" && (
          <div className="p-2.5 rounded-lg border border-success/20 bg-success/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-success/80">
                Opening Stock Onboarding (सुरुवाती मौज्दात)
              </span>
              <span className="text-[9px] text-muted-foreground">
                Zero bank debit; sets starting warehouse count
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground/80">Opening Stock Qty ({unit || "units"})</Label>
                <Input
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  type="number"
                  step="any"
                  placeholder="0.00"
                  className="h-8 text-xs bg-background/50 font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground/80">Unit Valuation Rate (NPR/{unit || "unit"})</Label>
                <Input
                  value={openingRate}
                  onChange={(e) => setOpeningRate(e.target.value)}
                  type="number"
                  step="any"
                  placeholder="0.00"
                  className="h-8 text-xs bg-background/50 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button size="sm" type="submit" disabled={mutation.isPending || !name || !unit} className="bg-info hover:bg-info text-white">
            {mutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add {resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} to Resource Library
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
