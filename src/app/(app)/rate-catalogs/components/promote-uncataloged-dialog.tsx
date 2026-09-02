"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, CheckCircle2, Loader2, Building2, Globe } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

export interface UncatalogedReviewItem {
  id: string;
  name: string; // rawName or name
  rawName?: string;
  category?: string | null;
  unit?: string | null;
  count?: number;
  suggestions?: Array<{
    id: string;
    name: string;
    subCategory?: string | null;
    category?: string | null;
    defaultUnit?: string | null;
    score?: number;
  }>;
}

export function PromoteUncatalogedDialog({
  open,
  onOpenChange,
  item,
  level = "org",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: UncatalogedReviewItem | null;
  level?: "org" | "global";
  onSuccess?: () => void;
}) {
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");
  const [category, setCategory] = useState("General");
  const [customCategory, setCustomCategory] = useState("");
  const [defaultUnit, setDefaultUnit] = useState("unit");
  const [defaultRate, setDefaultRate] = useState("");

  const activeCategory = category === "Custom" ? customCategory : category;

  // Parse raw name when item changes
  useEffect(() => {
    if (!item) return;

    const raw = (item.rawName || item.name || "").trim();

    // Check for parenthetical specification e.g. "Cement PPC (93 grade)"
    const parenMatch = raw.match(/^(.*?)\s*\((.*?)\)$/);
    if (parenMatch) {
      setName(parenMatch[1].trim());
      setSpec(parenMatch[2].trim());
    } else {
      setName(raw);
      setSpec("");
    }

    setCategory(item.category && item.category !== "Unspecified" ? item.category : "General");
    setCustomCategory("");
    setDefaultUnit(item.unit || "unit");
    setDefaultRate("");
  }, [item]);

  const promoteToOrgMut = trpc.uncatalogedMaterial.promoteToOrg.useMutation({
    onSuccess: () => {
      utils.uncatalogedMaterial.invalidate();
      utils.catalogV2.listMaterials.invalidate();
      utils.catalogV2.listRateCatalogs.invalidate();
      toast.success(`Promoted "${name}${spec ? ` (${spec})` : ""}" to Organization Catalog!`);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const promoteToGlobalMut = trpc.uncatalogedMaterial.promoteToGlobal.useMutation({
    onSuccess: () => {
      utils.uncatalogedMaterial.invalidate();
      utils.catalogV2.listMaterials.invalidate();
      toast.success(`Promoted "${name}${spec ? ` (${spec})` : ""}" to Global Catalog!`);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const mapToExistingMut = trpc.uncatalogedMaterial.mapToExisting.useMutation({
    onSuccess: () => {
      utils.uncatalogedMaterial.invalidate();
      utils.catalogV2.listMaterials.invalidate();
      toast.success(`Mapped to existing catalog item.`);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const isPending =
    promoteToOrgMut.isPending || promoteToGlobalMut.isPending || mapToExistingMut.isPending;

  const handlePromote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    if (!name.trim()) {
      toast.error("Please enter a material name.");
      return;
    }

    const cat = activeCategory.trim() || "General";
    const parsedRate = parseFloat(defaultRate) || 0;

    if (level === "global") {
      promoteToGlobalMut.mutate({
        id: item.id,
        canonicalName: name.trim(),
        subCategory: spec.trim() || undefined,
        category: cat,
        defaultUnit: defaultUnit.trim() || "unit",
        defaultRate: parsedRate,
      });
    } else {
      promoteToOrgMut.mutate({
        id: item.id,
        name: name.trim(),
        subCategory: spec.trim() || undefined,
        category: cat,
        defaultUnit: defaultUnit.trim() || "unit",
        defaultRate: parsedRate,
      });
    }
  };

  const handleMap = (targetId: string) => {
    if (!item) return;
    mapToExistingMut.mutate({
      id: item.id,
      targetType: level,
      targetId,
    });
  };

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(STANDARD_CATEGORIES);
    if (item?.category && item.category !== "Unspecified") set.add(item.category);
    return sortCategories(Array.from(set));
  }, [item]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handlePromote}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              {level === "global" ? (
                <Globe className="h-5 w-5 text-info" />
              ) : (
                <Building2 className="h-5 w-5 text-amber-500" />
              )}
              {level === "global" ? "Promote to Global Master" : "Promote to Organization Catalog"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Review and classify the unrecognized item before making it canonical across your{" "}
              {level === "global" ? "platform" : "organization"}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3.5">
            {/* Raw Name Header */}
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 flex items-center justify-between text-xs">
              <div>
                <span className="text-muted-foreground text-[11px] block">Unrecognized Source Name:</span>
                <span className="font-semibold text-foreground font-mono">{item.rawName || item.name}</span>
              </div>
              {item.count && item.count > 1 && (
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                  Used {item.count}x across projects
                </Badge>
              )}
            </div>

            {/* Smart Suggestions for Mapping */}
            {item.suggestions && item.suggestions.length > 0 && (
              <div className="rounded-md border border-border/50 bg-muted/30 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>Existing Catalog Matches:</span>
                </div>
                <div className="space-y-1">
                  {item.suggestions.slice(0, 2).map((sugg) => (
                    <div
                      key={sugg.id}
                      className="flex items-center justify-between bg-card/80 border border-border/40 rounded px-2 py-1 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{sugg.name}</span>
                        {sugg.subCategory && (
                          <span className="text-muted-foreground ml-1">({sugg.subCategory})</span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                          [{sugg.category || "General"}]
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleMap(sugg.id)}
                        className="h-6 text-[11px] px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Map to this
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Classification Inputs */}
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Main Category */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">
                    Category <span className="text-destructive">*</span>
                  </Label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-8 text-xs rounded-md border border-input bg-background px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="Custom">+ Custom Category...</option>
                  </select>
                </div>

                {/* Sub-Category / Material Name */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">
                    Material / Sub-Category <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cement PPC"
                    className="h-8 text-xs"
                    required
                  />
                </div>
              </div>

              {category === "Custom" && (
                <div className="space-y-1 animate-fade-in">
                  <Label className="text-xs font-semibold">Custom Category Name</Label>
                  <Input
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="e.g. Landscaping, Prefab"
                    className="h-8 text-xs"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Specification / Grade */}
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs font-semibold">Specification / Grade</Label>
                  <Input
                    value={spec}
                    onChange={(e) => setSpec(e.target.value)}
                    placeholder="e.g. 93 grade, 12mm"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Unit */}
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs font-semibold">
                    Default Unit <span className="text-destructive">*</span>
                  </Label>
                  <UnitSelect
                    value={defaultUnit}
                    onChange={setDefaultUnit}
                    className="w-full text-xs [&>button]:h-8"
                  />
                </div>

                {/* Base Rate */}
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs font-semibold">Base Rate (NPR)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={defaultRate}
                    onChange={(e) => setDefaultRate(e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Quick Specification Chips */}
              {COMMON_SPECIFICATIONS_BY_CATEGORY[activeCategory] && (
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Suggested {activeCategory} Specs:</span>
                  <div className="flex flex-wrap gap-1">
                    {COMMON_SPECIFICATIONS_BY_CATEGORY[activeCategory].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpec(s === "Standard" ? "" : s)}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer",
                          spec === s || (s === "Standard" && !spec)
                            ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 font-semibold"
                            : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !name.trim()}
              className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium gap-1.5"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
              Promote to {level === "global" ? "Global Master" : "Org Catalog"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
