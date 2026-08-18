"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function CreateVendorDialog({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<"material_supplier" | "equipment_vendor" | "both">(
    "material_supplier"
  );
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pan, setPan] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const mut = trpc.partner.createPartner.useMutation({
    onSuccess: () => {
      toast.success("Vendor added successfully");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Add Vendor</DialogTitle>
        <DialogDescription>Register a supplier or equipment rental partner.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Vendor Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Ltd."
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Vendor Code (Unique)</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ACM-01"
              className="h-9 text-sm"
            />
          </div>
        </div>
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
            <Input value={pan} onChange={(e) => setPan(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Registration Number</Label>
            <Input
              value={regNumber}
              onChange={(e) => setRegNumber(e.target.value)}
              placeholder="Reg-12345"
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
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            mut.mutate({
              projectId,
              name,
              type,
              code: code || undefined,
              regNumber: regNumber || undefined,
              contact: contact || undefined,
              phone: phone || undefined,
              email: email || undefined,
              pan: pan || undefined,
              address: address || undefined,
              notes: notes || undefined,
            })
          }
          disabled={mut.isPending || !name}
        >
          {mut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Add Vendor
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
