"use client";

import { Dialog } from "@/components/ui/dialog";
import {
  AddMaterialDialog,
  InwardDeliveryDialog,
  LogTransactionDialog,
  CreatePODialog,
  CreateRequisitionDialog,
} from "../dialogs";
import { POPrintView } from "./po-print-view";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function MaterialsDialogs({
  id,
  data,
  gateData,
  subsData,
  addMaterialOpen,
  setAddMaterialOpen,
  addGateOpen,
  setAddGateOpen,
  createReqOpen,
  setCreateReqOpen,
  createPOOpen,
  setCreatePOOpen,
  txnOpen,
  setTxnOpen,
  txnDefaultMaterial,
  txnDefaultType,
  txnDefaultGateId,
  selectedPoForPrint,
  setSelectedPoForPrint,
  poPrintOpen,
  setPoPrintOpen,
  deleteConfirmIds,
  setDeleteConfirmIds,
  deleteManyProjectMut,
}: {
  id: string;
  data: any;
  gateData: any;
  subsData: any;
  addMaterialOpen: boolean;
  setAddMaterialOpen: (open: boolean) => void;
  addGateOpen: boolean;
  setAddGateOpen: (open: boolean) => void;
  createReqOpen: boolean;
  setCreateReqOpen: (open: boolean) => void;
  createPOOpen: boolean;
  setCreatePOOpen: (open: boolean) => void;
  txnOpen: boolean;
  setTxnOpen: (open: boolean) => void;
  txnDefaultMaterial: string;
  txnDefaultType: "receive" | "issue";
  txnDefaultGateId: string;
  selectedPoForPrint: any;
  setSelectedPoForPrint: (po: any) => void;
  poPrintOpen: boolean;
  setPoPrintOpen: (open: boolean) => void;
  deleteConfirmIds: string[];
  setDeleteConfirmIds: (ids: string[]) => void;
  deleteManyProjectMut: any;
}) {
  const materials = data?.materials || [];
  const suppliers = data?.suppliers || [];
  const pendingGateEntries = gateData?.gateEntries || [];
  const activePOs = data?.purchaseOrders || [];
  const subcontractors = subsData?.subcontractors || [];

  return (
    <>
      <Dialog open={addMaterialOpen} onOpenChange={setAddMaterialOpen}>
        {addMaterialOpen && (
          <AddMaterialDialog projectId={id} onDone={() => setAddMaterialOpen(false)} />
        )}
      </Dialog>

      <Dialog open={addGateOpen} onOpenChange={setAddGateOpen}>
        {addGateOpen && (
          <InwardDeliveryDialog projectId={id} onDone={() => setAddGateOpen(false)} />
        )}
      </Dialog>

      <Dialog open={createReqOpen} onOpenChange={setCreateReqOpen}>
        {createReqOpen && (
          <CreateRequisitionDialog
            projectId={id}
            materials={materials}
            onDone={() => setCreateReqOpen(false)}
          />
        )}
      </Dialog>

      <Dialog open={createPOOpen} onOpenChange={setCreatePOOpen}>
        {createPOOpen && (
          <CreatePODialog
            projectId={id}
            materials={materials}
            suppliers={suppliers}
            onDone={() => setCreatePOOpen(false)}
          />
        )}
      </Dialog>

      <Dialog open={txnOpen} onOpenChange={setTxnOpen}>
        {txnOpen && (
          <LogTransactionDialog
            projectId={id}
            materials={materials}
            pendingGateEntries={pendingGateEntries}
            activePOs={activePOs}
            subcontractors={subcontractors}
            defaultMaterialId={txnDefaultMaterial}
            defaultType={txnDefaultType}
            defaultGateId={txnDefaultGateId}
            onDone={() => setTxnOpen(false)}
          />
        )}
      </Dialog>

      <POPrintView
        po={selectedPoForPrint}
        open={poPrintOpen}
        onOpenChange={(open) => {
          setPoPrintOpen(open);
          if (!open) setSelectedPoForPrint(null);
        }}
      />

      <AlertDialog
        open={deleteConfirmIds.length > 0}
        onOpenChange={(open) => !open && setDeleteConfirmIds([])}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteConfirmIds.length} material(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected material(s) from this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteManyProjectMut.mutate({ itemIds: deleteConfirmIds });
              }}
            >
              Delete Materials
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
