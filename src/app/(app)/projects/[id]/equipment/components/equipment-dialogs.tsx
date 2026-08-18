"use client";

import { Dialog } from "@/components/ui/dialog";
import { AddEquipDialog, AddLogDialog, AddMaintDialog, ResolveMaintDialog } from "../dialogs";
import { Equipment } from "./types";

export function EquipmentDialogs({
  id,
  allEquipment,
  addOpen,
  setAddOpen,
  logOpen,
  setLogOpen,
  maintOpen,
  setMaintOpen,
  resolveOpen,
  setResolveOpen,
  activeMaintId,
}: {
  id: string;
  allEquipment: Equipment[];
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  logOpen: boolean;
  setLogOpen: (open: boolean) => void;
  maintOpen: boolean;
  setMaintOpen: (open: boolean) => void;
  resolveOpen: boolean;
  setResolveOpen: (open: boolean) => void;
  activeMaintId: string | null;
}) {
  return (
    <>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        {addOpen && <AddEquipDialog projectId={id} onDone={() => setAddOpen(false)} />}
      </Dialog>
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        {logOpen && (
          <AddLogDialog
            projectId={id}
            equipmentList={allEquipment}
            onDone={() => setLogOpen(false)}
          />
        )}
      </Dialog>
      <Dialog open={maintOpen} onOpenChange={setMaintOpen}>
        {maintOpen && (
          <AddMaintDialog
            projectId={id}
            equipmentList={allEquipment}
            onDone={() => setMaintOpen(false)}
          />
        )}
      </Dialog>
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        {resolveOpen && activeMaintId && (
          <ResolveMaintDialog
            projectId={id}
            maintenanceId={activeMaintId}
            onDone={() => setResolveOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}
