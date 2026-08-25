"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export function DeleteDebitButton({ transactionId, projectId, subcontractorId }: { transactionId: string; projectId: string; subcontractorId: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const mutation = trpc.material.updateTransaction.useMutation({
    onSuccess: () => {
      utils.partner.getSubcontractor.invalidate({ projectId, subId: subcontractorId });
      toast.success("Debit recovery voided successfully");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <button onClick={() => setOpen(true)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Void Debit">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Void this Subcontractor Debit?</AlertDialogTitle><AlertDialogDescription>This transaction will remain in the general store ledger, but it will be removed from the subcontractor's bill deduction recovery list.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); mutation.mutate({ projectId, transactionId, isDebitable: false, subcontractorId: null, recoveryRate: null }); }}>Void Debit</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
