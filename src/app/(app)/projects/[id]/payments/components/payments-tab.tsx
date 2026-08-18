"use client";

import { useState } from "react";
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
import { Plus, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function npr(n: number) { return "NPR " + n.toLocaleString("en-IN", { maximumFractionDigits: 0 }); }

export function PaymentsTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = trpc.projectOps.payment.list.useQuery({ projectId });
  const { data: stats } = trpc.projectOps.payment.stats.useQuery({ projectId });
  const payments = data?.payments ?? [];
  const [payeeType, setPayeeType] = useState("vendor");
  const [payeeName, setPayeeName] = useState(""); const [amount, setAmount] = useState("");
  const [tds, setTds] = useState(""); const [mode, setMode] = useState("bank_transfer");
  const [chequeNo, setChequeNo] = useState(""); const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const createMut = trpc.projectOps.payment.create.useMutation({
    onSuccess: () => {
      utils.projectOps.payment.list.invalidate({ projectId });
      utils.projectOps.payment.stats.invalidate({ projectId });
      setAddOpen(false); setPayeeName(""); setAmount(""); setTds(""); setChequeNo(""); setNotes("");
      toast.success("Payment recorded");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Record Payment</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Log a payment made to a vendor, subcontractor, or supplier.</DialogDescription></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Payee Type</Label>
                  <Select value={payeeType} onValueChange={setPayeeType}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vendor">Vendor</SelectItem>
                      <SelectItem value="subcontractor">Subcontractor</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Payee Name</Label><Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="ABC Equipment Rentals" className="h-9 text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Amount (NPR)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">TDS Deducted (NPR)</Label><Input type="number" value={tds} onChange={(e) => setTds(e.target.value)} placeholder="750" className="h-9 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Payment Mode</Label>
                  <Select value={mode} onValueChange={setMode}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="mobile_pay">Mobile Pay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Cheque / Ref No.</Label><Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} className="h-9 text-sm" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={() => createMut.mutate({
                projectId, payeeType, payeeName,
                amount: parseFloat(amount) || 0,
                tdsDeducted: parseFloat(tds) || 0,
                paymentMode: mode as any,
                chequeNo: chequeNo || undefined,
                notes: notes || undefined,
                paymentDate: new Date(date).toISOString(),
              })} disabled={createMut.isPending || !payeeName || !amount}>
                {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-blue-600">{npr(stats.totalPaid)}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Total Paid</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-amber-600">{npr(stats.totalTds)}</div>
            <div className="text-[9px] text-muted-foreground uppercase">TDS Deducted</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-emerald-600">{npr(stats.totalRetentionReleased)}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Retention Released</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-slate-600">{stats.count}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Payments</div>
          </Card>
        </div>
      )}

      {isLoading ? <Skeleton className="h-64" /> : payments.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No payments recorded.</p>
        </CardContent></Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-2 text-left font-medium text-muted-foreground">Date</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Payee</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="p-2 text-right font-medium text-muted-foreground">Amount</th>
                <th className="p-2 text-right font-medium text-muted-foreground">TDS</th>
                <th className="p-2 text-right font-medium text-muted-foreground">Net Paid</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Mode</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Ref</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-t hover:bg-muted/20">
                  <td className="p-2 text-[10px]">{format(new Date(p.paymentDate), "dd MMM yy")}</td>
                  <td className="p-2 font-medium">{p.payeeName}</td>
                  <td className="p-2"><span className="rounded bg-muted px-1 text-[9px] capitalize">{p.payeeType}</span></td>
                  <td className="p-2 text-right tabular-nums font-medium">{npr(p.amount)}</td>
                  <td className="p-2 text-right tabular-nums text-amber-600">{p.tdsDeducted > 0 ? npr(p.tdsDeducted) : "—"}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-emerald-600">{npr(p.netPaid)}</td>
                  <td className="p-2 text-[10px] capitalize">{p.paymentMode.replace(/_/g, " ")}</td>
                  <td className="p-2 text-[10px] text-muted-foreground font-mono">{p.chequeNo || p.bankRef || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
