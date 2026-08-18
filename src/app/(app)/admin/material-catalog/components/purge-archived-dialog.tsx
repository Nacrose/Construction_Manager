"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PurgeArchivedDialog({
  open,
  onOpenChange,
  purgeConfirmText,
  setPurgeConfirmText,
  purgeArchivedMut,
}: {
  open: boolean;
  onOpenChange: (val: boolean) => void;
  purgeConfirmText: string;
  setPurgeConfirmText: (val: string) => void;
  purgeArchivedMut: any;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" /> Purge All Archived Items
          </DialogTitle>
          <DialogDescription className="space-y-2 text-xs text-left pt-2">
            <p>
              This action will <strong>permanently delete</strong> all archived catalog items from
              the database.
            </p>
            <p className="text-muted-foreground">
              Items that are still referenced by historical transactions (e.g. InwardDeliveries,
              DailyReports) will be safely skipped.
            </p>
            <p className="font-medium text-foreground pt-1">
              Type <span className="font-mono text-red-600 font-bold">PURGE</span> to confirm:
            </p>
          </DialogDescription>
        </DialogHeader>
        <Input
          value={purgeConfirmText}
          onChange={(e) => setPurgeConfirmText(e.target.value)}
          placeholder="PURGE"
          className="font-mono text-sm uppercase"
        />
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              setPurgeConfirmText("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={purgeConfirmText !== "PURGE" || purgeArchivedMut.isPending}
            onClick={() => purgeArchivedMut.mutate()}
            className="gap-1.5"
          >
            {purgeArchivedMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            Permanently Purge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
