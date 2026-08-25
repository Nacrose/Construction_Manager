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
import { Edit2 } from "lucide-react";
import { toast } from "sonner";
import { MaterialNameInput } from "@/components/material-name-input";
import { UnitSelect } from "@/components/unit-select";
import { STANDARD_CATEGORIES } from "@/lib/category-theme";

export function EditGlobalCatalogItemDialog({
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
  const [category, setCategory] = useState(item.category || "Roads & Highways");
  const [subCategory, setSubCategory] = useState(item.subCategory || "");
  const [defaultUnit, setDefaultUnit] = useState(item.defaultUnit || "cum");
  const [defaultRate, setDefaultRate] = useState(
    item.defaultRate ? String(item.defaultRate) : ""
  );

  const updateMutV2 = trpc.catalogV2.updateMaterial.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMutV2.mutateAsync({
        id: item.id,
        name: name.trim(),
        category: category.trim() || undefined,
        subCategory: subCategory.trim() || undefined,
        defaultUnit: defaultUnit.trim() || undefined,
        defaultRate: parseFloat(defaultRate) || 0,
      });

      const isGlobalItem = item.scope === "global" || item.isGlobal || !item.organizationId;
      toast.success(
        `${isGlobalItem ? "Global Master" : "Organization Custom"} item updated!`
      );
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Failed to update item.");
    }
  };

  const isGlobalItem = item.scope === "global" || item.isGlobal || !item.organizationId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Edit2 className="h-5 w-5 text-amber-500" />
            Edit {isGlobalItem ? "Global Master Item" : "Organization Custom Item"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Update canonical item specification, default unit, and metadata.
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
            <MaterialNameInput
              value={name}
              onChange={setName}
              scope={(item.scope as any) || (isGlobalItem ? "global" : "org")}
              projectId={item.projectId}
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Specification / Size / Grade (Optional)</Label>
            <Input
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Default Unit *</Label>
            <UnitSelect value={defaultUnit} onChange={setDefaultUnit} required />
          </div>

          <DialogFooter className="pt-2">
            <Button
              size="sm"
              type="submit"
              disabled={updateMutV2.isPending || !name}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isGlobalItem ? "Save Global Master Changes" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
