import { useMemo, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
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
import { Globe } from "lucide-react";
import { toast } from "sonner";
import { MaterialNameInput, type MaterialMatchItem } from "@/components/material-name-input";
import { UnitSelect } from "@/components/unit-select";
import { STANDARD_CATEGORIES, sortCategories } from "@/lib/category-theme";

const COMMON_SPECIFICATIONS_BY_CATEGORY: Record<string, string[]> = {
  "Cement": ["Standard", "33 Grade", "43 Grade", "53 Grade", "PPC", "OPC", "Rapid Hardening", "White"],
  "Road Works": ["Standard", "VG-10", "VG-30", "VG-40", "60/70", "80/100", "MC-30 Prime", "RC-70 Tack", "SS-1 Emulsion", "NP3", "NP4"],
  "Steel": ["Standard", "8mm", "10mm", "12mm", "16mm", "20mm", "25mm", "28mm", "32mm", "Fe 500D", "Fe 550D"],
  "Aggregate": ["Standard", "10mm", "20mm", "40mm", "Coarse Sand", "Fine Sand", "River Sand", "Crusher Run"],
  "Masonry": ["Standard", "Class A", "Class B", "Solid Block", "Hollow Block", "AAC Block"],
  "Plumbing": ["Standard", "1/2 inch", "3/4 inch", "1 inch", "1.5 inch", "2 inch", "3 inch", "4 inch", "6 inch", "110mm", "160mm", "PN 10", "PN 16"],
  "Electrical": ["Standard", "1.5 sq mm", "2.5 sq mm", "4 sq mm", "6 sq mm", "10 sq mm", "16 sq mm", "Single Phase", "Three Phase"],
  "Finishes": ["Standard", "Matte", "Gloss", "Exterior Weather-proof", "Interior Emulsion", "Primer"],
  "Tiles": ["Standard", "300x300mm", "600x600mm", "800x800mm", "Vitrified", "Ceramic", "Granite", "Marble"],
  "Timber": ["Standard", "Sal Wood", "Teak Wood", "Pine Wood", "12mm Plywood", "18mm Plywood"],
  "Labor": ["Skilled", "Semi-Skilled", "Unskilled", "Supervisor", "Foreman", "Operator", "Driver"],
  "Equipment": ["Per Hour", "Per Day", "With Operator & Fuel", "Dry Lease"],
};

export function CreateGlobalCatalogItemDialog({
  open,
  onOpenChange,
  onSuccess,
  isOrgScoped = false,
  isProjectScoped = false,
  projectId,
  existingNames = [],
  availableCategories = [],
  existingMaterials = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  isOrgScoped?: boolean;
  isProjectScoped?: boolean;
  projectId?: string;
  existingNames?: string[];
  availableCategories?: string[];
  existingMaterials?: Array<{ name: string; subCategory?: string | null; category?: string | null; defaultUnit?: string }>;
}) {
  const utils = trpc.useUtils();

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of availableCategories) {
      if (c && c !== "General" && c !== "Unspecified") set.add(c);
    }
    for (const c of STANDARD_CATEGORIES) {
      set.add(c);
    }
    return sortCategories(Array.from(set));
  }, [availableCategories]);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Road Works");
  const [customCategory, setCustomCategory] = useState("");
  const [spec, setSpec] = useState("");
  const [defaultUnit, setDefaultUnit] = useState("cum");
  const [defaultRate, setDefaultRate] = useState("");

  const activeCategory = category === "Custom" ? customCategory : category;

  useEffect(() => {
    if (categoryOptions.length > 0 && !categoryOptions.includes(category) && category !== "Custom") {
      setCategory(categoryOptions[0]);
    }
  }, [categoryOptions]);

  // Suggested specifications based on selected category & existing items in catalog
  const suggestedSpecs = useMemo(() => {
    const set = new Set<string>();
    const normName = name.toLowerCase().trim();

    // 1. Existing specs for this material in the catalog
    if (normName) {
      for (const m of existingMaterials) {
        if ((m.name || "").toLowerCase().trim() === normName && m.subCategory?.trim()) {
          set.add(m.subCategory.trim());
        }
      }
    }

    // 2. Standard category specifications
    const categorySpecs = COMMON_SPECIFICATIONS_BY_CATEGORY[activeCategory] || [];
    for (const s of categorySpecs) {
      if (s && s !== "Standard") set.add(s);
    }

    return Array.from(set);
  }, [name, activeCategory, existingMaterials]);

  // Real-time duplicate checking on (name + spec)
  const isDuplicate = useMemo(() => {
    const normName = name.toLowerCase().trim();
    if (!normName) return false;
    const normSpec = spec.toLowerCase().trim();

    return existingMaterials.some((m) => {
      const mName = (m.name || "").toLowerCase().trim();
      const mSub = (m.subCategory || "").toLowerCase().trim();
      return mName === normName && mSub === normSpec;
    });
  }, [name, spec, existingMaterials]);

  const createCatalogMut = trpc.catalogV2.createMaterial.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a material name.");
      return;
    }
    if (isDuplicate) {
      toast.error(`Material "${name.trim()}${spec.trim() ? ` (${spec.trim()})` : ""}" already exists in this catalog.`);
      return;
    }
    try {
      const scope = isProjectScoped ? "project" as const : isOrgScoped ? "org" as const : "global" as const;
      await createCatalogMut.mutateAsync({
        scope,
        projectId: projectId || undefined,
        name: name.trim(),
        category: activeCategory.trim() || undefined,
        subCategory: spec.trim() || undefined,
        defaultUnit: defaultUnit.trim() || "unit",
        defaultRate: parseFloat(defaultRate) || 0,
      });
      utils.catalogV2.listMaterials.invalidate();
      toast.success(`"${name.trim()}" successfully added to ${isProjectScoped ? "Project" : isOrgScoped ? "Organization" : "Global Master"} Catalog!`);
      setName("");
      setSpec("");
      setDefaultRate("");
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Failed to create item.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Globe className="h-5 w-5 text-amber-500" />
            {isProjectScoped
              ? "Add Custom Material to Project Catalog"
              : isOrgScoped
                ? "Add Item to Organization Catalog"
                : "Add Item to Global Master Catalog"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isProjectScoped
              ? "Creates a custom material item scoped to this project."
              : isOrgScoped
                ? "Creates a custom material item scoped to your organization."
                : "Creates a platform-wide canonical item available across all organizations."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Main Category */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Main Category *</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-8 w-full rounded border border-input bg-background px-2.5 text-xs shadow-2xs font-medium"
            >
              {categoryOptions.map((c) => (
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
                placeholder="e.g. Tunnel Equipment"
                className="h-8 text-xs"
                required
              />
            </div>
          )}

          {/* Sub-Category / Material Name with Live Search & Match suggestions */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Sub-Category / Material Name *</Label>
            <MaterialNameInput
              value={name}
              onChange={setName}
              onSelectMatch={(match: MaterialMatchItem) => {
                setName(match.name);
                if (match.category && !customCategory && categoryOptions.includes(match.category)) {
                  setCategory(match.category);
                }
                if (match.subCategory) {
                  setSpec(match.subCategory);
                }
                if (match.defaultUnit) {
                  setDefaultUnit(match.defaultUnit);
                }
              }}
              scope={isProjectScoped ? "project" : isOrgScoped ? "org" : "global"}
              projectId={projectId}
              placeholder="Type material name (e.g. Cement PPC, Bituminous Concrete, Rebar)..."
              required
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              Type to check similarity or select from canonical catalog materials.
            </p>
          </div>

          {/* Specification / Size / Grade with Live Fuzzy Match Suggestions */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Specification / Size / Grade (Optional)</Label>
              {suggestedSpecs.length > 0 && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={suggestedSpecs.join(", ")}>
                  Suggestions: {suggestedSpecs.slice(0, 4).join(", ")}
                </span>
              )}
            </div>
            <Input
              list="catalog-spec-suggestions"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              placeholder="e.g. 43 grade, 53 grade, 12mm, 20mm, VG-30"
              className="h-8 text-xs"
            />
            <datalist id="catalog-spec-suggestions">
              {suggestedSpecs.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* Real-time duplicate warning */}
          {isDuplicate && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2 animate-in fade-in-50">
              <span className="font-semibold">⚠️</span>
              <span>
                Material <strong>&quot;{name.trim()}{spec.trim() ? ` (${spec.trim()})` : ""}&quot;</strong> already exists in this catalog.
              </span>
            </div>
          )}

          {/* Default Unit */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Default Unit *</Label>
            <UnitSelect value={defaultUnit} onChange={setDefaultUnit} required />
          </div>

          <DialogFooter className="pt-2">
            <Button
              size="sm"
              type="submit"
              disabled={createCatalogMut.isPending || !name.trim() || isDuplicate}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isProjectScoped
                ? "Add Material to Project Catalog"
                : isOrgScoped
                  ? "Save to Organization Catalog"
                  : "Save Global Master Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
