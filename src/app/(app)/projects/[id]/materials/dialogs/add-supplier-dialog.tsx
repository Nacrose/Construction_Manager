"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";

export function AddSupplierDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [pan, setPan] = useState("");
  const [rating, setRating] = useState("5");

  const mutation = trpc.partner.createSupplier.useMutation({
    onSuccess: () => {
      utils.material.list.invalidate({ projectId });
      toast.success("Supplier added successfully");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      projectId,
      name,
      contact: contact || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      pan: pan || null,
      rating: parseInt(rating) || 5,
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5"><Label>Supplier Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Contact Person</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
          <div className="space-y-1.5"><Label>PAN (Tax ID)</Label><Input value={pan} onChange={(e) => setPan(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>Rating (1-5)</Label>
          <select value={rating} onChange={(e) => setRating(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm">
            <option value="5">5 Stars (Excellent)</option>
            <option value="4">4 Stars (Good)</option>
            <option value="3">3 Stars (Average)</option>
            <option value="2">2 Stars (Fair)</option>
            <option value="1">1 Star (Poor)</option>
          </select>
        </div>
        <DialogFooter><Button type="submit" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add Supplier</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
