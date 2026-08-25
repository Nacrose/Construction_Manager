"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Building2, Loader2, Phone, FileText, Inbox } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function npr(n: number) {
  return "NPR " + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function VendorsTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = trpc.equipment.listVendors.useQuery({ projectId });
  const vendors = data?.vendors ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button size="sm" className="h-7 text-xs gap-1"><Plus className="h-3 w-3" /> Add Vendor</Button></DialogTrigger>
          <CreateVendorDialog projectId={projectId} onDone={() => { setAddOpen(false); utils.equipment.listVendors.invalidate({ projectId }); }} />
        </Dialog>
      </div>

      {isLoading ? <Skeleton className="h-64" /> : vendors.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No equipment vendors registered.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map(v => (
            <Card key={v.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetailId(v.id)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-md bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{v.name}</p>
                    {v.contact && <p className="text-xs text-muted-foreground truncate">{v.contact}</p>}
                  </div>
                  <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium", v.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800")}>{v.status}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>📦 {v.stats.totalRentals} rentals</span>
                  <span className="text-emerald-600">● {v.stats.activeRentals} active</span>
                </div>
                {v.phone && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Phone className="h-2.5 w-2.5" /> {v.phone}</div>}
                {v.stats.activeEquipment.length > 0 && (
                  <div className="text-[10px] text-muted-foreground truncate">Equipment: {v.stats.activeEquipment.join(", ")}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {detailId && <VendorDetailDialog vendorId={detailId} projectId={projectId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function CreateVendorDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pan, setPan] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const mut = trpc.equipment.createVendor.useMutation({ onSuccess: () => { toast.success("Vendor added"); onDone(); }, onError: (e) => toast.error(e.message) });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Add Equipment Vendor</DialogTitle><DialogDescription>Register a vendor who supplies rented equipment.</DialogDescription></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5"><Label className="text-xs">Vendor Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ABC Equipment Rentals" className="h-9 text-sm" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Contact Person</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} className="h-9 text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-sm" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs">PAN</Label><Input value={pan} onChange={(e) => setPan(e.target.value)} className="h-9 text-sm" /></div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-9 text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 text-sm" /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={() => mut.mutate({ projectId, name, contact: contact || undefined, phone: phone || undefined, email: email || undefined, pan: pan || undefined, address: address || undefined, notes: notes || undefined })} disabled={mut.isPending || !name}>{mut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Add</Button></DialogFooter>
    </DialogContent>
  );
}

function VendorDetailDialog({ vendorId, projectId, onClose }: { vendorId: string; projectId: string; onClose: () => void }) {
  const { data, isLoading } = trpc.equipment.getVendor.useQuery({ vendorId });
  const vendor = data?.vendor;
  const stats = data?.stats;

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> {vendor?.name ?? "Loading..."}</DialogTitle></DialogHeader>
        {isLoading ? <Skeleton className="h-48" /> : vendor ? (
          <div className="space-y-4">
            {/* Vendor info */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {vendor.contact && <div><span className="text-muted-foreground">Contact:</span> {vendor.contact}</div>}
              {vendor.phone && <div><span className="text-muted-foreground">Phone:</span> {vendor.phone}</div>}
              {vendor.email && <div><span className="text-muted-foreground">Email:</span> {vendor.email}</div>}
              {vendor.pan && <div><span className="text-muted-foreground">PAN:</span> {vendor.pan}</div>}
              {vendor.address && <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {vendor.address}</div>}
            </div>

            {/* Cost summary */}
            {stats && (
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 text-center"><div className="text-sm font-bold text-blue-600">{npr(stats.totalBilled)}</div><div className="text-[9px] text-muted-foreground uppercase">Total Billed</div></Card>
                <Card className="p-3 text-center"><div className="text-sm font-bold text-red-600">{npr(stats.totalDeductions)}</div><div className="text-[9px] text-muted-foreground uppercase">Deductions</div></Card>
                <Card className="p-3 text-center"><div className="text-sm font-bold text-emerald-600">{npr(stats.netPayable)}</div><div className="text-[9px] text-muted-foreground uppercase">Net Payable</div></Card>
              </div>
            )}

            {/* Rentals */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Rentals ({vendor.rentals.length})</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {vendor.rentals.map(r => (
                  <div key={r.id} className="flex items-center gap-2 rounded border p-2 text-xs">
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.equipment.name}</div>
                      <div className="text-[10px] text-muted-foreground">{format(new Date(r.startDate), "dd MMM yy")} · {r.billableDays} days · {npr(r.rentalCost)}</div>
                    </div>
                    <span className={cn("rounded px-1 text-[9px] uppercase shrink-0",
                      r.status === "active" ? "bg-emerald-100 text-emerald-700" :
                      r.status === "stored_on_site" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-500"
                    )}>{r.status.replace(/_/g, " ")}</span>
                    {r.totalDeductions > 0 && <span className="text-[9px] text-red-600 shrink-0">-{npr(r.totalDeductions)}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : <p className="text-center text-sm text-muted-foreground py-8">Vendor not found.</p>}
      </DialogContent>
    </Dialog>
  );
}
