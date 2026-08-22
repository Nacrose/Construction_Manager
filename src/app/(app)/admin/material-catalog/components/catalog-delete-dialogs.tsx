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
import { Trash2, AlertTriangle, Undo2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConfirmCatalogDeleteDialog({
  ids,
  open,
  onOpenChange,
  onConfirm,
  onArchive,
}: {
  ids: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onArchive?: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const { data: impact, isLoading } = trpc.catalogV2.getDeleteImpact.useQuery(
    { ids },
    { enabled: open && ids.length > 0 }
  );

  const handleClose = () => {
    setConfirmText("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-amber-700 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Archive / Delete {ids.length} item(s)?
          </DialogTitle>
          <DialogDescription className="text-xs">
            Archiving hides items from the catalog but preserves all history. Hard-delete is
            permanent and only available when items have no active references.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {impact?.hasImpact ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
                <p className="font-bold flex items-center gap-1">
                  ⚠ These items are referenced in:
                </p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {impact.rateCatalogItems > 0 && (
                    <li>{impact.rateCatalogItems} Rate Catalog item(s)</li>
                  )}
                  {impact.projectMaterials > 0 && (
                    <li>{impact.projectMaterials} Project Directory material(s)</li>
                  )}
                  {impact.boqIngredients > 0 && (
                    <li>{impact.boqIngredients} BOQ Ingredient(s)</li>
                  )}
                  {impact.presetIngredients > 0 && (
                    <li>{impact.presetIngredients} Preset analysis ingredient(s)</li>
                  )}
                  {impact.partnerSupplies > 0 && (
                    <li>{impact.partnerSupplies} Partner Supply record(s)</li>
                  )}
                </ul>
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Hard-delete is blocked. You can archive instead — existing references will
                  continue to work.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                <p className="font-medium">
                  ✓ Safe to hard-delete. No active references found in rates, BOQs, or
                  projects.
                </p>
              </div>
            )}

            {/* Only show DELETE confirmation input when no references */}
            {!impact?.hasImpact && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground">
                  For hard-delete, type{" "}
                  <span className="font-bold font-mono text-red-600">DELETE</span> below:
                </Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="h-8 text-xs font-semibold border-red-200 focus-visible:ring-red-500"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          {/* Archive (soft-delete) — always available */}
          {onArchive && (
            <Button
              variant="outline"
              size="sm"
              className="border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20"
              onClick={() => {
                onArchive();
                handleClose();
              }}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Archive (Recoverable)
            </Button>
          )}
          {/* Hard delete — only when no references */}
          {!impact?.hasImpact && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirmText === "DELETE") {
                  onConfirm();
                  handleClose();
                }
              }}
              disabled={confirmText !== "DELETE" || isLoading}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Permanently Delete
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryDeleteDialog({
  open,
  onOpenChange,
  category,
  groupName,
  isAdmin,
  onArchiveAll,
  onDeleteSafeArchiveRest,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string;
  groupName?: string;
  isAdmin: boolean;
  onArchiveAll: () => void;
  onDeleteSafeArchiveRest: () => void;
  isLoading: boolean;
}) {
  const scopeLabel = groupName ? `"${groupName}" group` : `"${category}" category`;
  const { data: impact, isLoading: impactLoading } =
    trpc.catalogV2.getCategoryImpact.useQuery(
      { category, subCategory: groupName },
      { enabled: open }
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-amber-700 flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Archive {scopeLabel}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Choose how to handle the {impact?.totalCount ?? "..."} item(s) in {scopeLabel}.
          </DialogDescription>
        </DialogHeader>

        {impactLoading ? (
          <div className="flex h-28 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {/* Dependency summary */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md border border-border p-2">
                <p className="font-bold text-lg text-foreground">{impact?.totalCount ?? 0}</p>
                <p className="text-muted-foreground">Total</p>
              </div>
              <div
                className={cn(
                  "rounded-md border p-2",
                  (impact?.referencedCount ?? 0) > 0
                    ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
                    : "border-border"
                )}
              >
                <p
                  className={cn(
                    "font-bold text-lg",
                    (impact?.referencedCount ?? 0) > 0
                      ? "text-amber-700"
                      : "text-foreground"
                  )}
                >
                  {impact?.referencedCount ?? 0}
                </p>
                <p className="text-muted-foreground">Referenced</p>
              </div>
              <div
                className={cn(
                  "rounded-md border p-2",
                  (impact?.safeCount ?? 0) > 0
                    ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"
                    : "border-border"
                )}
              >
                <p
                  className={cn(
                    "font-bold text-lg",
                    (impact?.safeCount ?? 0) > 0
                      ? "text-emerald-700"
                      : "text-foreground"
                  )}
                >
                  {impact?.safeCount ?? 0}
                </p>
                <p className="text-muted-foreground">Safe to delete</p>
              </div>
            </div>

            {(impact?.referencedCount ?? 0) > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-md px-3 py-2">
                <strong>{impact?.referencedCount}</strong> item(s) are used in projects, BOQs,
                or rate catalogs and cannot be hard-deleted. They will be archived instead.
              </p>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-foreground">Choose action:</p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2 h-auto py-2 text-xs border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                  disabled={isLoading}
                  onClick={() => {
                    onArchiveAll();
                    onOpenChange(false);
                  }}
                >
                  <Undo2 className="h-4 w-4 shrink-0" />
                  <div className="text-left">
                    <p className="font-semibold">
                      Archive All ({impact?.totalCount ?? 0} items)
                    </p>
                    <p className="text-muted-foreground font-normal">
                      Safe — hides from catalog, recoverable from Archived view. Recommended.
                    </p>
                  </div>
                </Button>
                {isAdmin && (impact?.safeCount ?? 0) > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2 h-auto py-2 text-xs border-red-300 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                    disabled={isLoading}
                    onClick={() => {
                      onDeleteSafeArchiveRest();
                      onOpenChange(false);
                    }}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <div className="text-left">
                      <p className="font-semibold">Delete Unused + Archive Referenced</p>
                      <p className="text-muted-foreground font-normal">
                        Hard-deletes {impact?.safeCount} safe item(s); archives{" "}
                        {impact?.referencedCount} referenced item(s). SuperAdmin only.
                      </p>
                    </div>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
