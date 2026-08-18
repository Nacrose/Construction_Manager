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
import { Globe } from "lucide-react";
import { toast } from "sonner";
import { MaterialNameInput, type MaterialMatchItem } from "@/components/material-name-input";
import { UnitSelect } from "@/components/unit-select";
import { STANDARD_CATEGORIES } from "@/lib/category-theme";

export function CreateGlobalCatalogItemDialog({
  open,
  onOpenChange,
  onSuccess,
  isOrgScoped = false,
  isProjectScoped = false,
  projectId,
  existingNames = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  isOrgScoped?: boolean;
  isProjectScoped?: boolean;
  projectId?: string;
  existingNames?: string[];
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Roads & Highways");
  const [customCategory, setCustomCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [defaultUnit, setDefaultUnit] = useState("cum");
  const [defaultRate, setDefaultRate] = useState("");

  const createCatalogMut = trpc.materialCatalog.create.useMutation();
  const createProjectMaterialMut = trpc.material.create.useMutation();
  const activeCategory = category === "Custom" ? customCategory : category;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isProjectScoped && projectId) {
        await createProjectMaterialMut.mutateAsync({
          projectId,
          name: name.trim(),
          category: activeCategory.trim() || undefined,
          subCategory: subCategory.trim() || undefined,
          unit: defaultUnit.trim() || "unit",
          minStock: 0,
          currentStock: 0,
          reorderLevel: 0,
        });
        utils.material.list.invalidate({ projectId });
        utils.materialCatalog.previewSyncToProject.invalidate({ projectId });
        toast.success(`"${name}" successfully added to Project Catalog!`);
      } else {
        await createCatalogMut.mutateAsync({
          name: name.trim(),
          category: activeCategory.trim() || undefined,
          subCategory: subCategory.trim() || undefined,
          defaultUnit: defaultUnit.trim() || "unit",
          defaultRate: parseFloat(defaultRate) || 0,
          isGlobal: !isOrgScoped,
        });
        utils.materialCatalog.list.invalidate();
        toast.success(
          `"${name}" successfully added to ${isOrgScoped ? "Organization" : "Global Master"} Catalog!`
        );
      }
      setName("");
      setSubCategory("");
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
                placeholder="e.g. Tunnel Equipment"
                className="h-8 text-xs"
                required
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Sub-Category / Material Name *</Label>
            <MaterialNameInput
              value={name}
              onChange={setName}
              onSelectMatch={(match: MaterialMatchItem) => {
                setName(match.name);
                if (match.category && !customCategory) {
                  setCategory(match.category);
                }
                if (match.defaultUnit) {
                  setDefaultUnit(match.defaultUnit);
                }
              }}
              scope={isOrgScoped ? "org" : "global"}
              placeholder="Type material name (e.g. Bitumen, Cement, Rebar)..."
              required
            />
            <p className="text-[10px] text-muted-foreground">
              Instant similarity check detects existing catalog materials and prevents duplicates.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Specification / Size / Grade (Optional)</Label>
            <Input
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              placeholder="e.g. VG-30 Grade, SDA 32mm, Fe500D 12mm"
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
              disabled={createCatalogMut.isPending || !name}
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
