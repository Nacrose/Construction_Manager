"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AddStaffDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [category, setCategory] = useState("skilled");
  const [phone, setPhone] = useState("");
  const [dailyWage, setDailyWage] = useState("");

  const mutation = trpc.hr.create.useMutation({
    onSuccess: () => {
      utils.hr.list.invalidate({ projectId });
      toast.success("Staff added");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      projectId,
      name,
      designation: designation || undefined,
      category: category || undefined,
      phone: phone || undefined,
      dailyWage: parseFloat(dailyWage) || 0,
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Add staff member</DialogTitle></DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Mason" /></div>
          <div className="space-y-1.5"><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="skilled" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Daily wage (NPR)</Label><Input value={dailyWage} onChange={(e) => setDailyWage(e.target.value)} type="number" /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
