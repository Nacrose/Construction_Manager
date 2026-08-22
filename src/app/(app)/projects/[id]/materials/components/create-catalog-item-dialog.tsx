"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { getUser } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Layers,
  CheckCircle2,
  Loader2,
  Globe,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UnitSelect } from "@/components/unit-select";
import { STANDARD_CATEGORIES } from "@/lib/category-theme";

export const SUB_CATEGORY_PRESETS: Record<string, string[]> = {
  "Civil & Concrete": [
    "10mm",
    "20mm",
    "40mm",
    "Boulders",
    "53 Grade OPC",
    "43 Grade OPC",
    "PPC",
  ],
  "Steel & Rebar": [
    "8mm",
    "10mm",
    "12mm",
    "16mm",
    "20mm",
    "25mm",
    "32mm",
    "Binding Wire",
  ],
  "Plumbing & Sanitary": [
    "4 inch Class 4",
    "6 inch HDPE",
    "1 inch PPR",
    "CPVC Fitting",
    "Water Tank 1000L",
  ],
  "Electrical & Power": [
    "1.5 sq mm Wire",
    "2.5 sq mm Wire",
    "4 sq mm Wire",
    "16A Single Pole MCB",
    "DB Box 8-Way",
  ],
  "Finishes & Carpentry": [
    "Enamel Paint",
    "Emulsion Paint",
    "Tiles 2x2 ft",
    "Plywood 12mm",
  ],
  "Equipment & Machinery": [
    "400 KVA",
    "20-Ton",
    "Single Phase",
    "Three Phase",
  ],
};

export const PRESET_RATE_SOURCES = [
  "Morang District Rates 2080/81",
  "Kathmandu District Rates 2080/81",
  "Sunsari District Rates 2080/81",
  "Kaski District Rates 2080/81",
  "Lalitpur District Rates 2080/81",
  "Market Rate Benchmark (2026)",
  "Government Baseline Rates",
  "Standard Vendor Quote",
];

export function RateSourceCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = PRESET_RATE_SOURCES.filter((s) =>
    s.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Select or type custom rate source (e.g. Morang 2080/81)"
        className="h-8 text-xs pr-8 font-mono"
      />
      <Tag className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md text-xs">
            <div className="px-2 py-1 border-b mb-1">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Search rate sources..."
                className="h-7 text-xs"
              />
            </div>
            {filtered.map((source) => (
              <div
                key={source}
                onClick={() => {
                  onChange(source);
                  setOpen(false);
                }}
                className={cn(
                  "cursor-pointer rounded px-2 py-1.5 hover:bg-accent hover:text-accent-foreground flex items-center justify-between text-xs",
                  value === source && "bg-accent font-semibold"
                )}
              >
                <span>{source}</span>
                {value === source && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />
                )}
              </div>
            ))}
            {search && !filtered.includes(search) && (
              <div
                onClick={() => {
                  onChange(search);
                  setOpen(false);
                }}
                className="cursor-pointer rounded px-2 py-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-xs font-medium border-t mt-1"
              >
                + Use custom: &quot;{search}&quot;
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function CreateCatalogItemDialog({
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Civil & Concrete");
  const [customCategory, setCustomCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [defaultUnit, setDefaultUnit] = useState("cum");
  const [defaultRate, setDefaultRate] = useState("");
  const [rateSource, setRateSource] = useState("Morang District Rates 2080/81");
  const [isGlobal, setIsGlobal] = useState(false);
  const [addToProject, setAddToProject] = useState(true);

  const user = getUser();
  const isAdmin = Boolean(user?.orgRole === "org_admin");

  const createCatalogMut = trpc.catalogV2.createMaterial.useMutation();
  const createMaterialMut = trpc.material.create.useMutation();

  const isPending = createCatalogMut.isPending || createMaterialMut.isPending;
  const activeCategory = category === "Custom" ? customCategory : category;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const scope = isAdmin && isGlobal ? "global" : "org";
      const res = await createCatalogMut.mutateAsync({
        scope: scope as any,
        name: name.trim(),
        category: activeCategory.trim() || undefined,
        subCategory: subCategory.trim() || undefined,
        defaultUnit: defaultUnit.trim() || "unit",
        defaultRate: parseFloat(defaultRate) || 0,
      });

      if (addToProject && (res as any).material) {
        const mat = (res as any).material;
        const catPrefix = (activeCategory || "MAT").substring(0, 3).toUpperCase();
        const specSuffix = subCategory
          ? `-${subCategory.replace(/\s+/g, "").toUpperCase()}`
          : "";
        await createMaterialMut.mutateAsync({
          projectId,
          name: mat.name,
          code: `${catPrefix}${specSuffix}`,
          category: mat.category || undefined,
          subCategory: mat.subCategory || undefined,
          catalogMaterialId: mat.id,
          unit: mat.defaultUnit || "unit",
          minStock: 0,
          currentStock: 0,
          reorderLevel: 0,
        } as any);
      }

      toast.success(`"${name}" successfully added to Master Catalog!`);
      setName("");
      setSubCategory("");
      setDefaultRate("");
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Failed to create catalog item.");
    }
  };

  const activeCategoryKey = Object.keys(SUB_CATEGORY_PRESETS).find(
    (k) => k.toLowerCase() === (activeCategory || "").toLowerCase()
  );
  const currentPresets = activeCategoryKey ? SUB_CATEGORY_PRESETS[activeCategoryKey] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-amber-500" />
            Add Item to Master Catalog
          </DialogTitle>
          <DialogDescription className="text-xs">
            Creates a canonical item under its Main Category & Sub-Category with baseline rates.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Main Category *</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-8 w-full rounded border border-input bg-background px-2.5 text-xs shadow-2xs font-medium"
            >
              {STANDARD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="Custom">✏️ + Custom Category</option>
            </select>
          </div>

          {category === "Custom" && (
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Custom Category Name *</Label>
              <Input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="e.g. Safety Gear"
                className="h-8 text-xs"
                required
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Sub-Category / Material Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aggregate / Rebar / Cement"
              className="h-8 text-xs"
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">
              Specification / Size / Grade (Optional)
            </Label>
            <Input
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              placeholder="e.g. 20mm, 12mm, 53 Grade"
              className="h-8 text-xs"
            />
          </div>

          {/* Sub-Category Presets */}
          {currentPresets.length > 0 && (
            <div className="space-y-1 bg-muted/20 p-2.5 rounded-lg border text-xs">
              <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                <Layers className="h-3 w-3 text-blue-500" /> Quick Size Presets for{" "}
                {activeCategory}:
              </span>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {currentPresets.map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => setSubCategory(preset)}
                    className={cn(
                      "px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all",
                      subCategory === preset
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-card hover:bg-muted text-foreground border-border"
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Default Unit *</Label>
              <UnitSelect value={defaultUnit} onChange={setDefaultUnit} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Baseline Rate (NPR)</Label>
              <Input
                value={defaultRate}
                onChange={(e) => setDefaultRate(e.target.value)}
                type="number"
                step="any"
                placeholder="e.g. 2400"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          {/* Rate Source Combobox */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Rate Source / Provenance</Label>
            <RateSourceCombobox value={rateSource} onChange={setRateSource} />
          </div>

          {/* Superadmin Global Toggle */}
          {isAdmin && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900">
              <div className="space-y-0.5">
                <Label
                  htmlFor="isGlobalCheck"
                  className="text-xs font-semibold text-purple-900 dark:text-purple-200 flex items-center gap-1.5"
                >
                  <Globe className="h-3.5 w-3.5 text-purple-600" /> Global Master Canonical Item
                </Label>
                <p className="text-[10px] text-purple-700 dark:text-purple-300">
                  Visible across all organizations in the platform (Superadmin feature)
                </p>
              </div>
              <input
                type="checkbox"
                id="isGlobalCheck"
                checked={isGlobal}
                onChange={(e) => setIsGlobal(e.target.checked)}
                className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
              />
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="addToProjectCheck"
              checked={addToProject}
              onChange={(e) => setAddToProject(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <Label htmlFor="addToProjectCheck" className="text-xs font-medium cursor-pointer">
              Also add immediately to current project directory
            </Label>
          </div>

          <DialogFooter className="pt-2">
            <Button
              size="sm"
              type="submit"
              disabled={isPending || !name}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {addToProject
                ? "Add Material to Project Catalog"
                : "Save to Organization Catalog"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
