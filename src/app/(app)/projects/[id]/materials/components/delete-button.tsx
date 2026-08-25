"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";

export function DeleteButton({ itemId, projectId }: { itemId: string; projectId: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const { data: impact, isLoading } = trpc.material.checkProjectDeleteImpact.useQuery(
    { itemIds: [itemId] },
    { enabled: open }
  );

  const mutation = trpc.material.delete.useMutation({
    onSuccess: () => {
      utils.material.list.invalidate({ projectId });
      toast.success("Deleted successfully");
      setOpen(false);
      setConfirmText("");
    },
    onError: (e) => toast.error(e.message),
  });

  const onDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText !== "DELETE") return;
    mutation.mutate({ itemId });
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="w-full text-left text-red-600 hover:text-red-700"
        aria-label="Delete"
      >
        Delete
      </button>

      <Dialog open={open} onOpenChange={(v) => {
        setOpen(v);
        if (!v) setConfirmText("");
      }}>
        <DialogContent onClick={(e) => e.stopPropagation()} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 animate-bounce" />
              Are you absolutely sure?
            </DialogTitle>
            <DialogDescription className="text-xs">
              This action will permanently delete this material from the project directory.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form onSubmit={onDelete} className="space-y-4 py-2">
              {impact?.hasImpact ? (
                <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 p-3 text-xs text-red-800 dark:text-red-300 space-y-1.5 animate-pulse">
                  <p className="font-bold flex items-center gap-1">⚠️ Warning: Deleting this item will impact:</p>
                  <ul className="list-disc pl-5 space-y-0.5 font-medium">
                    {impact.transactions > 0 && <li>{impact.transactions} Material Transaction(s) (will be deleted)</li>}
                    {impact.purchaseOrderItems > 0 && <li>{impact.purchaseOrderItems} Purchase Order reference(s) (will be unlinked)</li>}
                    {impact.boqIngredients > 0 && <li>{impact.boqIngredients} BOQ Ingredient relation(s) (will be deleted)</li>}
                    {impact.requisitionItems > 0 && <li>{impact.requisitionItems} Requisition line item(s) (will be unlinked)</li>}
                  </ul>
                  <p className="font-semibold mt-2">This stock history and links will be permanently lost.</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground font-medium">
                  This item is safe to delete. No active transactions or PO references exist for this material.
                </p>
              )}

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground">
                  To confirm, type <span className="font-bold font-mono text-red-600">DELETE</span> below:
                </Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="h-8 text-xs font-semibold border-red-200 focus-visible:ring-red-500"
                  required
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    setConfirmText("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={confirmText !== "DELETE" || mutation.isPending}
                >
                  {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Permanently Delete
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
