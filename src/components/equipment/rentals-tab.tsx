"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Loader2, Truck, Package, AlertTriangle, Upload, FileText, Users,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";

function npr(n: number) {
  return "NPR " + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "text-success", bg: "bg-success/15 dark:bg-success" },
  stored_on_site: { label: "Stored on Site", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950" },
  returned: { label: "Returned", color: "text-muted-foreground", bg: "bg-muted dark:bg-[var(--navy-mid)]" },
};

export function RentalsTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [crewDialogId, setCrewDialogId] = useState<string | null>(null);
  const [damageDialogId, setDamageDialogId] = useState<string | null>(null);

  const rentalsQuery = trpc.equipment.listRentals.useInfiniteQuery(
    { projectId },
    { getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined) }
  );
  const { data: rentalStats } = trpc.equipment.rentalStats.useQuery({ projectId });
  const { data: equipData } = trpc.equipment.list.useQuery({ projectId });
  const { data: vendorData } = trpc.equipment.listVendors.useQuery({
    projectId,
    // Deliberate max page: consumed as a picker list inside CreateRentalDialog.
    limit: 500,
  });

  const rentals = rentalsQuery.data ? rentalsQuery.data.pages.flatMap((p) => p.rentals) : [];

  const markStoredMut = trpc.equipment.markStored.useMutation({
    onSuccess: () => { utils.equipment.listRentals.invalidate({ projectId }); utils.equipment.rentalStats.invalidate({ projectId }); toast.success("Marked as stored — rent stopped"); },
    onError: (e) => toast.error(e.message),
  });
  const markReturnedMut = trpc.equipment.markReturned.useMutation({
    onSuccess: () => { utils.equipment.listRentals.invalidate({ projectId }); utils.equipment.rentalStats.invalidate({ projectId }); toast.success("Equipment returned — rental closed"); },
    onError: (e) => toast.error(e.message),
  });
  const reactivateMut = trpc.equipment.reactivate.useMutation({
    onSuccess: () => { utils.equipment.listRentals.invalidate({ projectId }); toast.success("Equipment reactivated — rent resumed"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Stats */}
      {rentalStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="p-3"><div className="text-lg font-bold text-success">{rentalStats.activeCount}</div><div className="text-[9px] text-muted-foreground uppercase">Active</div></Card>
          <Card className="p-3"><div className="text-lg font-bold text-amber-600">{rentalStats.storedCount}</div><div className="text-[9px] text-muted-foreground uppercase">Stored</div></Card>
          <Card className="p-3"><div className="text-lg font-bold text-muted-foreground">{rentalStats.returnedCount}</div><div className="text-[9px] text-muted-foreground uppercase">Returned</div></Card>
          <Card className="p-3"><div className="text-lg font-bold text-info">{npr(rentalStats.dailyAccruing)}</div><div className="text-[9px] text-muted-foreground uppercase">Daily Accruing</div></Card>
        </div>
      )}

      {/* Stored too long alert */}
      {rentalStats && rentalStats.storedTooLong.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-2 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="text-xs">
              <span className="font-medium text-amber-700 dark:text-amber-400">{rentalStats.storedTooLong.length} equipment stored too long!</span>
              {rentalStats.storedTooLong.map((s: any) => (
                <span key={s.id} className="block text-[10px] text-amber-600/80">{s.equipmentName} — {s.daysStored} days stored, potential savings: {npr(s.potentialSavings)}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add button */}
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button size="sm" className="h-7 text-xs gap-1"><Plus className="h-3 w-3" /> New Rental</Button></DialogTrigger>
          <CreateRentalDialog projectId={projectId} equipment={equipData?.equipment ?? []} vendors={vendorData?.vendors ?? []} onDone={() => { setAddOpen(false); utils.equipment.listRentals.invalidate({ projectId }); utils.equipment.rentalStats.invalidate({ projectId }); }} />
        </Dialog>
      </div>

      {/* Rental cards */}
      {rentalsQuery.isLoading ? <Skeleton className="h-64" /> : rentals.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Truck className="h-12 w-12 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No equipment rentals yet.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rentals.map(r => {
            const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.active;
            return (
              <Card key={r.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3 space-y-2">
                  {/* Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <span className="text-sm font-semibold">{r.equipment.name}</span>
                        {r.equipment.code && <span className="text-xs text-muted-foreground ml-1 font-mono">{r.equipment.code}</span>}
                      </div>
                    </div>
                    <span className={cn("rounded px-2 py-0.5 text-[10px] font-medium", cfg.bg, cfg.color)}>{cfg.label}</span>
                  </div>

                  {/* Rental details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Rate:</span> <span className="font-medium">{npr(r.rentalRate)}/{r.rentalType === "daily" ? "day" : r.rentalType === "hourly" ? "hr" : r.rentalType === "monthly" ? "mo" : "lump"}</span></div>
                    <div><span className="text-muted-foreground">Started:</span> {format(new Date(r.startDate), "dd MMM yy")}</div>
                    <div><span className="text-muted-foreground">Billable:</span> <span className="font-medium">{r.billableDays} days</span></div>
                    <div><span className="text-muted-foreground">Machine cost:</span> <span className="font-medium">{npr(r.machineCost)}</span></div>
                  </div>

                  {/* Crew cost */}
                  {r.crewDailyCost > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border-t pt-2">
                      <div><span className="text-muted-foreground">Crew cost/day:</span> <span className="font-medium text-info">{npr(r.crewDailyCost)}</span></div>
                      <div><span className="text-muted-foreground">Total crew:</span> <span className="font-medium">{npr(r.crewDailyCost * r.billableDays)}</span></div>
                      <div><span className="text-muted-foreground">Total project:</span> <span className="font-bold text-primary">{npr(r.totalProjectCost)}</span></div>
                      <div><span className="text-muted-foreground">Daily rate (all):</span> <span className="font-bold">{npr(r.totalDailyRate)}/day</span></div>
                    </div>
                  )}

                  {/* Vendor info */}
                  {r.isExternal && (r.vendorName || r.vendorId) && (
                    <div className="text-[10px] text-muted-foreground">
                      🏢 Vendor: {r.vendorName || vendorData?.vendors.find(v => v.id === r.vendorId)?.name || "—"}
                      {r.maintenanceBy !== "vendor" && <span className="ml-2">🔧 Maint: {r.maintenanceBy === "shared" ? `Shared (min ${npr(r.maintenanceMinContractor)})` : r.maintenanceBy}</span>}
                      {r.consumablesBy !== "vendor" && <span className="ml-2">🛢️ Consumables: {r.consumablesBy}</span>}
                    </div>
                  )}

                  {/* Stored info */}
                  {r.status === "stored_on_site" && r.storedFromDate && (
                    <div className="text-[10px] text-amber-600 dark:text-amber-400">
                      ⏸️ Rent stopped on {format(new Date(r.storedFromDate), "dd MMM yy")} — stored for {r.daysStored} days
                      {r.daysOverdue > 0 && <span className="text-red-600 ml-2">⚠️ {r.daysOverdue} days past scheduled return</span>}
                    </div>
                  )}

                  {/* Crew + damage buttons */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => setCrewDialogId(r.id)}>
                      <Users className="h-3 w-3" /> Crew ({r.crew?.length ?? 0})
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-red-600" onClick={() => setDamageDialogId(r.id)}>
                      <AlertTriangle className="h-3 w-3" /> Damage
                    </Button>
                    <div className="flex-1" />
                    {/* Status actions */}
                    {r.status === "active" && (
                      <>
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => markStoredMut.mutate({ rentalId: r.id })} disabled={markStoredMut.isPending}>Mark Stored</Button>
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => markReturnedMut.mutate({ rentalId: r.id })} disabled={markReturnedMut.isPending}>Return</Button>
                      </>
                    )}
                    {r.status === "stored_on_site" && (
                      <>
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => reactivateMut.mutate({ rentalId: r.id })} disabled={reactivateMut.isPending}>Reactivate</Button>
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => markReturnedMut.mutate({ rentalId: r.id })} disabled={markReturnedMut.isPending}>Return</Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {rentalsQuery.hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => rentalsQuery.fetchNextPage()} disabled={rentalsQuery.isFetchingNextPage}>
                {rentalsQuery.isFetchingNextPage ? "Loading…" : "Load more rentals"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Crew dialog */}
      {crewDialogId && <CrewDialog rentalId={crewDialogId} projectId={projectId} onClose={() => setCrewDialogId(null)} />}
      {/* Damage dialog */}
      {damageDialogId && <DamageDialog rentalId={damageDialogId} projectId={projectId} onClose={() => setDamageDialogId(null)} />}
    </div>
  );
}

// ─── Create Rental Dialog ──────────────────────────────────
function CreateRentalDialog({ projectId, equipment, vendors, onDone }: { projectId: string; equipment: any[]; vendors: any[]; onDone: () => void }) {
  const [equipmentId, setEquipmentId] = useState("");
  const [isExternal, setIsExternal] = useState(true);
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [rentalType, setRentalType] = useState("daily");
  const [rentalRate, setRentalRate] = useState("");
  const [scheduledEndDate, setScheduledEndDate] = useState("");
  const [maintenanceBy, setMaintenanceBy] = useState("vendor");
  const [consumablesBy, setConsumablesBy] = useState("vendor");
  const [notes, setNotes] = useState("");

  const mut = trpc.equipment.createRental.useMutation({ onSuccess: () => { toast.success("Rental created"); onDone(); }, onError: (e) => toast.error(e.message) });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>New Equipment Rental</DialogTitle><DialogDescription>Track equipment rented to this project with cost control.</DialogDescription></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5"><Label className="text-xs">Equipment</Label>
          <Select value={equipmentId} onValueChange={setEquipmentId}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select equipment" /></SelectTrigger><SelectContent>
            {equipment.map(e => <SelectItem key={e.id} value={e.id}>{e.name} {e.code && `(${e.code})`}</SelectItem>)}
          </SelectContent></Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Source</Label>
            <Select value={isExternal ? "external" : "internal"} onValueChange={(v) => setIsExternal(v === "external")}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="external">External (hired)</SelectItem><SelectItem value="internal">Internal (own fleet)</SelectItem>
            </SelectContent></Select>
          </div>
          {isExternal && (
            <div className="space-y-1.5"><Label className="text-xs">Vendor</Label>
              <Select value={vendorId} onValueChange={(v) => { setVendorId(v); if (v !== "none") setVendorName(vendors.find(x => x.id === v)?.name ?? ""); }}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger><SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent></Select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Rental Type</Label>
            <Select value={rentalType} onValueChange={setRentalType}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="daily">Daily</SelectItem><SelectItem value="hourly">Hourly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="lump_sum">Lump Sum</SelectItem>
            </SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Rate (NPR)</Label><Input type="number" value={rentalRate} onChange={(e) => setRentalRate(e.target.value)} placeholder="5000" className="h-9 text-sm" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Maintenance By</Label>
            <Select value={maintenanceBy} onValueChange={setMaintenanceBy}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="vendor">Vendor</SelectItem><SelectItem value="contractor">Contractor</SelectItem><SelectItem value="shared">Shared</SelectItem>
            </SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Consumables By</Label>
            <Select value={consumablesBy} onValueChange={setConsumablesBy}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="vendor">Vendor</SelectItem><SelectItem value="contractor">Contractor</SelectItem>
            </SelectContent></Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Scheduled Return Date (नेपाली / BS - optional)</Label>
          <NepaliDatePicker value={scheduledEndDate} onChange={(_, dateStr) => setScheduledEndDate(dateStr)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={() => mut.mutate({ equipmentId, projectId, isExternal, vendorName: vendorId === "none" ? undefined : (vendors.find(x => x.id === vendorId)?.name ?? vendorName), rentalType: rentalType as any, rentalRate: parseFloat(rentalRate) || 0, scheduledEndDate: scheduledEndDate ? new Date(scheduledEndDate).toISOString() : undefined, notes: notes || undefined })} disabled={mut.isPending || !equipmentId}>{mut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create Rental</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Crew Dialog ───────────────────────────────────────────
function CrewDialog({ rentalId, projectId, onClose }: { rentalId: string; projectId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.equipment.listCrew.useQuery({ rentalId });
  const [name, setName] = useState("");
  const [role, setRole] = useState("operator");
  const [salaryRate, setSalaryRate] = useState("");
  const [salaryPaidBy, setSalaryPaidBy] = useState("project");
  const [allowanceRate, setAllowanceRate] = useState("");
  const [allowancePaidBy, setAllowancePaidBy] = useState("project");
  const [lodgingType, setLodgingType] = useState("none");
  const [lodgingRate, setLodgingRate] = useState("");
  const [foodingType, setFoodingType] = useState("none");
  const [foodingRate, setFoodingRate] = useState("");

  const addMut = trpc.equipment.addCrew.useMutation({
    onSuccess: () => { utils.equipment.listCrew.invalidate({ rentalId }); utils.equipment.listRentals.invalidate({ projectId }); setName(""); setSalaryRate(""); setAllowanceRate(""); setLodgingRate(""); setFoodingRate(""); toast.success("Crew member added"); },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.equipment.removeCrew.useMutation({
    onSuccess: () => { utils.equipment.listCrew.invalidate({ rentalId }); utils.equipment.listRentals.invalidate({ projectId }); toast.success("Crew member removed"); },
    onError: (e) => toast.error(e.message),
  });

  const crew = data?.crew ?? [];

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Crew Management</DialogTitle></DialogHeader>
        {isLoading ? <Skeleton className="h-32" /> : (
          <div className="space-y-3">
            {/* Existing crew */}
            {crew.length > 0 && (
              <div className="space-y-1">
                {crew.map(c => (
                  <div key={c.id} className="flex items-center gap-2 rounded border p-2 text-xs">
                    <div className="flex-1">
                      <div className="font-medium">{c.name} <span className="text-muted-foreground capitalize">({c.role})</span></div>
                      <div className="text-[10px] text-muted-foreground">
                        Salary: {c.salaryRate}/{c.salaryType} ({c.salaryPaidBy}) · Allow: {c.allowanceRate || 0} ({c.allowancePaidBy})
                        {c.lodgingType !== "none" && <> · Lodge: {c.lodgingType} {c.lodgingRate || 0}</>}
                        {c.foodingType !== "none" && <> · Food: {c.foodingType} {c.foodingRate || 0}</>}
                      </div>
                    </div>
                    <button onClick={() => removeMut.mutate({ crewId: c.id })} className="text-muted-foreground hover:text-destructive text-xs">✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add crew form */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Add Crew Member</p>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px]">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ram Bahadur" className="h-8 text-xs" /></div>
                <div><Label className="text-[10px]">Role</Label>
                  <Select value={role} onValueChange={setRole}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="operator">Operator</SelectItem><SelectItem value="driver">Driver</SelectItem><SelectItem value="helper">Helper</SelectItem><SelectItem value="mechanic">Mechanic</SelectItem>
                  </SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px]">Salary (NPR/day)</Label><Input type="number" value={salaryRate} onChange={(e) => setSalaryRate(e.target.value)} placeholder="2000" className="h-8 text-xs" /></div>
                <div><Label className="text-[10px]">Salary Paid By</Label>
                  <Select value={salaryPaidBy} onValueChange={setSalaryPaidBy}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="project">Project</SelectItem><SelectItem value="vendor">Vendor</SelectItem>
                  </SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px]">Allowance (NPR/day)</Label><Input type="number" value={allowanceRate} onChange={(e) => setAllowanceRate(e.target.value)} placeholder="300" className="h-8 text-xs" /></div>
                <div><Label className="text-[10px]">Allowance Paid By</Label>
                  <Select value={allowancePaidBy} onValueChange={setAllowancePaidBy}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="project">Project</SelectItem><SelectItem value="vendor">Vendor</SelectItem>
                  </SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px]">Lodging</Label>
                  <Select value={lodgingType} onValueChange={setLodgingType}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="none">None</SelectItem><SelectItem value="project_provided">Project Provided</SelectItem><SelectItem value="monthly_reimburse">Monthly Reimburse</SelectItem><SelectItem value="per_diem">Per Diem</SelectItem>
                  </SelectContent></Select>
                </div>
                <div><Label className="text-[10px]">Lodging Rate</Label><Input type="number" value={lodgingRate} onChange={(e) => setLodgingRate(e.target.value)} placeholder="8000" className="h-8 text-xs" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px]">Fooding</Label>
                  <Select value={foodingType} onValueChange={setFoodingType}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="none">None</SelectItem><SelectItem value="project_provided">Project Provided</SelectItem><SelectItem value="daily_allowance">Daily Allowance</SelectItem>
                  </SelectContent></Select>
                </div>
                <div><Label className="text-[10px]">Food Rate</Label><Input type="number" value={foodingRate} onChange={(e) => setFoodingRate(e.target.value)} placeholder="400" className="h-8 text-xs" /></div>
              </div>
              <Button size="sm" className="w-full h-7 text-xs" onClick={() => addMut.mutate({
                rentalId, name, role: role as any, salaryRate: parseFloat(salaryRate) || 0, salaryPaidBy: salaryPaidBy as any,
                allowanceRate: parseFloat(allowanceRate) || 0, allowancePaidBy: allowancePaidBy as any,
                lodgingType: lodgingType as any, lodgingRate: parseFloat(lodgingRate) || 0, lodgingPaidBy: "project",
                foodingType: foodingType as any, foodingRate: parseFloat(foodingRate) || 0, foodingPaidBy: "project",
              })} disabled={addMut.isPending || !name}>Add Member</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Damage Dialog ─────────────────────────────────────────
function DamageDialog({ rentalId, projectId, onClose }: { rentalId: string; projectId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.equipment.listDamages.useQuery({ rentalId });
  const [description, setDescription] = useState("");
  const [damageType, setDamageType] = useState("normal_wear");
  const [responsibleParty, setResponsibleParty] = useState("contractor");
  const [repairCost, setRepairCost] = useState("");
  const [paidBy, setPaidBy] = useState("contractor");

  const reportMut = trpc.equipment.reportDamage.useMutation({
    onSuccess: () => { utils.equipment.listDamages.invalidate({ rentalId }); setDescription(""); setRepairCost(""); toast.success("Damage reported"); },
    onError: (e) => toast.error(e.message),
  });

  const damages = data?.damages ?? [];

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Damage Report</DialogTitle></DialogHeader>
        {isLoading ? <Skeleton className="h-32" /> : (
          <div className="space-y-3">
            {/* Existing damages */}
            {damages.length > 0 && (
              <div className="space-y-1">
                {damages.map(d => (
                  <div key={d.id} className="rounded border p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{d.description}</span>
                      <span className={cn("rounded px-1 text-[9px] uppercase", d.status === "repaired" ? "bg-success/15 text-success" : d.status === "disputed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>{d.status}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(d.date), "dd MMM yy")} · {d.damageType} · {d.responsibleParty} · {npr(d.repairCost)} ({d.paidBy})
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Report form */}
            <div className="border-t pt-3 space-y-2">
              <div className="space-y-1.5"><Label className="text-[10px]">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Boom hydraulic leak" className="text-sm" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px]">Type</Label>
                  <Select value={damageType} onValueChange={setDamageType}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="normal_wear">Normal Wear</SelectItem><SelectItem value="negligence">Negligence</SelectItem><SelectItem value="accident">Accident</SelectItem><SelectItem value="force_majeure">Force Majeure</SelectItem>
                  </SelectContent></Select>
                </div>
                <div><Label className="text-[10px]">Responsible</Label>
                  <Select value={responsibleParty} onValueChange={setResponsibleParty}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="contractor">Contractor</SelectItem><SelectItem value="vendor">Vendor</SelectItem><SelectItem value="shared">Shared</SelectItem><SelectItem value="third_party">Third Party</SelectItem>
                  </SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px]">Repair Cost (NPR)</Label><Input type="number" value={repairCost} onChange={(e) => setRepairCost(e.target.value)} placeholder="15000" className="h-8 text-xs" /></div>
                <div><Label className="text-[10px]">Paid By</Label>
                  <Select value={paidBy} onValueChange={setPaidBy}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="contractor">Contractor</SelectItem><SelectItem value="vendor">Vendor</SelectItem><SelectItem value="insurance">Insurance</SelectItem><SelectItem value="shared">Shared</SelectItem>
                  </SelectContent></Select>
                </div>
              </div>
              <Button size="sm" className="w-full h-7 text-xs" onClick={() => reportMut.mutate({ rentalId, description, damageType: damageType as any, responsibleParty: responsibleParty as any, repairCost: parseFloat(repairCost) || 0, paidBy: paidBy as any })} disabled={reportMut.isPending || !description}>Report Damage</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
