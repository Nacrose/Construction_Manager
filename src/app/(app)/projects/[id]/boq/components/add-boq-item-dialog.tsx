"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { UNITS } from "../types";

/**
 * AddBoqItemDialog — modal form for creating a new BOQ item.
 *
 * Replaces the old inline-add-row at the top of the table. A dialog is
 * cleaner because:
 * - It doesn't shift the table content down when opened
 * - It has proper form layout with labels (easier to fill than inline cells)
 * - It can show validation errors clearly
 * - It matches the "popup form" pattern the user requested
 */
export function AddBoqItemDialog({
  projectId,
  existingCount,
  existingSections,
  isLocked,
  defaultSection = "",
  open,
  onOpenChange,
}: {
  projectId: string;
  existingCount: number;
  existingSections: string[];
  isLocked: boolean;
  defaultSection?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [code, setCode] = useState(String(existingCount + 1));
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("cum");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [section, setSection] = useState("");
  const [newSectionName, setNewSectionName] = useState("");

  // Reset form when dialog opens (pre-filling the section passed from the
  // right-click "Add item" menu).
  useEffect(() => {
    if (open) {
      setCode(String(existingCount + 1));
      setDescription("");
      setUnit("cum");
      setQuantity("");
      setRate("");
      setSection(defaultSection);
      setNewSectionName("");
    }
  }, [open, defaultSection]); // Only reset when dialog opens, not when existingCount changes

  const mutation = trpc.boq.create.useMutation({
    onSuccess: () => {
      utils.boq.list.invalidate({ projectId });
      toast.success("Item added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked) {
      toast.error("BOQ is locked. Changes must be made via Variation Orders.");
      return;
    }
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    const finalSection =
      section === "__new__"
        ? newSectionName.trim() || undefined
        : section || undefined;

    mutation.mutate({
      projectId,
      code: code || String(existingCount + 1),
      description: description.trim(),
      unit,
      quantity: parseFloat(quantity) || 0,
      rate: parseFloat(rate) || 0,
      section: finalSection,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add BOQ Item</DialogTitle>
          <DialogDescription>
            Fill in the details below. Press Enter or click Add to save.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <Label htmlFor="add-code" className="text-xs">Code</Label>
              <Input
                id="add-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="1.1"
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="add-unit" className="text-xs">Unit</Label>
              <select
                id="add-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-desc" className="text-xs">Description *</Label>
            <Input
              id="add-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Excavation in ordinary soil"
              className="h-9"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-qty" className="text-xs">Quantity</Label>
              <Input
                id="add-qty"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                type="text"
                inputMode="decimal"
                placeholder="0"
                className="h-9 text-right font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-rate" className="text-xs">Rate (NPR)</Label>
              <Input
                id="add-rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                type="text"
                inputMode="decimal"
                placeholder="0"
                className="h-9 text-right font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-section" className="text-xs">Section</Label>
            <select
              id="add-section"
              value={section}
              onChange={(e) => {
                setSection(e.target.value);
                if (e.target.value !== "__new__") setNewSectionName("");
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">— No section —</option>
              {existingSections.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="__new__">+ New section…</option>
            </select>
            {section === "__new__" && (
              <Input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="Type new section name"
                className="h-9 mt-1.5"
                autoFocus
              />
            )}
          </div>

          {/* Live amount preview */}
          {(parseFloat(quantity) > 0 || parseFloat(rate) > 0) && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-right text-sm">
              <span className="text-muted-foreground">Amount: </span>
              <span className="font-mono font-medium">
                NPR {((parseFloat(quantity) || 0) * (parseFloat(rate) || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !description.trim()}
              className="bg-navy-gradient text-white border-0"
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
