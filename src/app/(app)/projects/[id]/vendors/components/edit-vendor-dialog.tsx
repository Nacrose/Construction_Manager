"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function EditVendorDialog({
  partner,
  onClose,
  onDone,
}: {
  partner: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(partner.name);
  const [code, setCode] = useState(partner.code || "");
  const [type, setType] = useState<"material_supplier" | "equipment_vendor" | "both">(partner.type);
  const [contact, setContact] = useState(partner.contact || "");
  const [phone, setPhone] = useState(partner.phone || "");
  const [email, setEmail] = useState(partner.email || "");
  const [pan, setPan] = useState(partner.pan || "");
  const [regNumber, setRegNumber] = useState(partner.regNumber || "");
  const [address, setAddress] = useState(partner.address || "");
  const [status, setStatus] = useState(partner.status);
  const [notes, setNotes] = useState(partner.notes || "");

  const mut = trpc.partner.updatePartner.useMutation({
    onSuccess: () => {
      toast.success("Vendor updated successfully");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog
      open={true}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Vendor</DialogTitle>
          <DialogDescription>Modify partner registry details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Vendor Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vendor Code (Unique)</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Vendor Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="material_supplier">Material Supplier</option>
                <option value="equipment_vendor">Equipment Vendor</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Contact Person</Label>
              <Input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">PAN Number</Label>
              <Input
                value={pan}
                onChange={(e) => setPan(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Registration Number</Label>
              <Input
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              mut.mutate({
                partnerId: partner.id,
                name,
                type,
                code: code || null,
                regNumber: regNumber || null,
                contact: contact || null,
                phone: phone || null,
                email: email || null,
                pan: pan || null,
                address: address || null,
                status,
                notes: notes || null,
              })
            }
            disabled={mut.isPending || !name}
          >
            {mut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
