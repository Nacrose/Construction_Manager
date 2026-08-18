"use client";

import { useState } from "react";
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
import { Edit2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { UnitSelect } from "@/components/unit-select";
import { STANDARD_CATEGORIES } from "@/lib/category-theme";
import { RateSourceCombobox } from "./create-catalog-item-dialog";

export function EditCatalogItemDialog({
  item,
  open,
  onOpenChange,
  onSuccess,
}: {
  item: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(item.name || "");
  const [category, setCategory] = useState(item.category || "Civil & Concrete");
  const [subCategory, setSubCategory] = useState(item.subCategory || "");
  const [defaultUnit, setDefaultUnit] = useState(item.defaultUnit || "cum");
  const [defaultRate, setDefaultRate] = useState(
    item.defaultRate ? String(item.defaultRate) : ""
  );
  const [rateSource, setRateSource] = useState(item.rateSource || "");

  const updateMut = trpc.materialCatalog.update.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMut.mutateAsync({
        id: item.id,
        name: name.trim(),
        category: category.trim() || undefined,
        subCategory: subCategory.trim() || undefined,
        defaultUnit: defaultUnit.trim() || undefined,
        defaultRate: parseFloat(defaultRate) || 0,
        rateSource: rateSource.trim() || undefined,
      });

      toast.success(`Catalog item updated!`);
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Failed to update catalog item.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Edit2 className="h-5 w-5 text-amber-500" />
            Edit Catalog Item Details
          </DialogTitle>
          <DialogDescription className="text-xs">
            Update canonical item specification, baseline rate, and rate source provenance.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Main Category</Label>
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
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Sub-Category / Material Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
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

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Rate Source / Provenance</Label>
            <RateSourceCombobox value={rateSource} onChange={setRateSource} />
          </div>

          <DialogFooter className="pt-2">
            <Button
              size="sm"
              type="submit"
              disabled={updateMut.isPending || !name}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {updateMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
