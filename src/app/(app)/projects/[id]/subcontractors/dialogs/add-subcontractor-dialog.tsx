"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AddSubcontractorDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pan, setPan] = useState("");

  const mutation = trpc.partner.createSubcontractor.useMutation({
    onSuccess: () => {
      utils.partner.listSubcontractors.invalidate({ projectId });
      toast.success("Subcontractor added successfully");
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
      pan: pan || null,
      status: "active",
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Add Subcontractor</DialogTitle></DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5"><Label>Subcontractor Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Nepal Builders JV" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Contact Person</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
          <div className="space-y-1.5"><Label>PAN (Tax ID)</Label><Input value={pan} onChange={(e) => setPan(e.target.value)} /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Register Subcontractor</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
