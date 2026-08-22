"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Upload,
  Paperclip,
  CheckCircle2,
  Package,
  Layers,
  FileCheck,
  Receipt,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { adToBs } from "@/lib/nepali-calendar";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MissingScansTab({
  projectId,
  canWrite = false,
}: {
  projectId: string;
  canWrite?: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: pData, isLoading: pLoading } = trpc.vatRegister.getPurchaseRegister.useQuery({ projectId });
  const { data: sData, isLoading: sLoading } = trpc.vatRegister.getSalesRegister.useQuery({ projectId });

  const [activeUpload, setActiveUpload] = useState<{
    targetType: "material_grn" | "client_ipc" | "subcontractor_bill" | "direct_bill" | "direct_sales" | "equipment_spot";
    targetId: string;
    invoiceNo: string;
    partyName: string;
  } | null>(null);

  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const attachMut = trpc.vatRegister.attachScannedBill.useMutation({
    onSuccess: () => {
      toast.success("Scanned bill uploaded successfully");
      setActiveUpload(null);
      setFileData(null);
      setFileName("");
      utils.vatRegister.getPurchaseRegister.invalidate({ projectId });
      utils.vatRegister.getSalesRegister.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (pLoading || sLoading || !pData || !sData) {
    return (
      <div className="p-8 text-center text-muted-foreground text-xs font-mono">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 text-primary" />
        Auditing unattached invoices...
      </div>
    );
  }

  const missingPurchases = pData.rows.filter((r) => !r.isBillAttached);
  const missingSales = sData.rows.filter((r) => !r.isBillAttached);
  const totalMissing = missingPurchases.length + missingSales.length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setFileData(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUpload || !fileData) {
      toast.error("Please choose a file to upload");
      return;
    }

    attachMut.mutate({
      projectId,
      targetType: activeUpload.targetType,
      targetId: activeUpload.targetId,
      scannedBillUrl: fileData,
      scannedBillName: fileName,
    });
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Alert Header */}
      <div className="flex items-center justify-between p-3 rounded-md border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-xs">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <div>
            <span className="font-bold text-amber-950 dark:text-amber-200">
              Tax Compliance Audit: {totalMissing} Missing Scanned Invoice(s)
            </span>
            <p className="text-muted-foreground text-[11px]">
              Nepali tax regulations require soft copies of physical VAT bills to be archived for 6 years. Attach them below.
            </p>
          </div>
        </div>

        <Badge variant="outline" className="border-amber-400 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 text-[10px]">
          {totalMissing === 0 ? "100% Tax Audit Ready" : `${totalMissing} Unattached Bills`}
        </Badge>
      </div>

      {totalMissing === 0 ? (
        <div className="p-12 text-center border rounded-md bg-card">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-foreground">All Invoices Have Attached Scans</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Both your Purchase Register (Schedule 8) and Sales Register (Schedule 9) have complete digital paper trails.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Missing Purchases */}
          {missingPurchases.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-blue-600" />
                Missing Purchase / Inward Scans ({missingPurchases.length})
              </h4>

              <div className="rounded-md border overflow-x-auto bg-card">
                <table className="w-full text-xs font-mono border-collapse tabular-nums">
                  <thead>
                    <tr className="bg-muted/70 border-b text-[11px] text-muted-foreground text-left">
                      <th className="p-2 w-24">Date</th>
                      <th className="p-2 w-28">Invoice #</th>
                      <th className="p-2">Supplier / Vendor</th>
                      <th className="p-2 w-24 text-right">Taxable</th>
                      <th className="p-2 w-24 text-right font-bold text-emerald-700 dark:text-emerald-300">VAT (13%)</th>
                      <th className="p-2 w-24 text-right font-bold">Total</th>
                      <th className="p-2 w-24 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {missingPurchases.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/10">
                        <td className="p-2 text-muted-foreground whitespace-nowrap">
                          {format(new Date(r.date), "dd MMM yyyy")}
                        </td>
                        <td className="p-2 font-bold text-foreground">{r.invoiceNo}</td>
                        <td className="p-2 font-sans truncate max-w-[220px]">
                          <span className="font-semibold text-foreground">{r.partyName}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">{r.description}</span>
                        </td>
                        <td className="p-2 text-right">{fmt(r.taxableLocal)}</td>
                        <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-300">{fmt(r.vatAmount)}</td>
                        <td className="p-2 text-right font-bold">{fmt(r.totalAmount)}</td>
                        <td className="p-2 text-center">
                          {canWrite && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setActiveUpload({
                                  targetType: r.source,
                                  targetId: r.sourceRefId,
                                  invoiceNo: r.invoiceNo,
                                  partyName: r.partyName,
                                })
                              }
                              className="h-6 text-[10px] gap-1"
                            >
                              <Upload className="h-2.5 w-2.5" /> Attach Scan
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Missing Sales */}
          {missingSales.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileCheck className="h-3.5 w-3.5 text-blue-600" />
                Missing Client IPC / Sales Invoices ({missingSales.length})
              </h4>

              <div className="rounded-md border overflow-x-auto bg-card">
                <table className="w-full text-xs font-mono border-collapse tabular-nums">
                  <thead>
                    <tr className="bg-muted/70 border-b text-[11px] text-muted-foreground text-left">
                      <th className="p-2 w-24">Date</th>
                      <th className="p-2 w-28">IPC / Invoice #</th>
                      <th className="p-2">Client / Employer</th>
                      <th className="p-2 w-24 text-right">Taxable</th>
                      <th className="p-2 w-24 text-right font-bold text-amber-700 dark:text-amber-300">Output VAT (13%)</th>
                      <th className="p-2 w-24 text-right font-bold">Total</th>
                      <th className="p-2 w-24 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {missingSales.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/10">
                        <td className="p-2 text-muted-foreground whitespace-nowrap">
                          {format(new Date(r.date), "dd MMM yyyy")}
                        </td>
                        <td className="p-2 font-bold text-foreground">{r.invoiceNo}</td>
                        <td className="p-2 font-sans truncate max-w-[220px]">
                          <span className="font-semibold text-foreground">{r.clientName}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">{r.description}</span>
                        </td>
                        <td className="p-2 text-right">{fmt(r.taxableSales)}</td>
                        <td className="p-2 text-right font-bold text-amber-700 dark:text-amber-300">{fmt(r.vatAmount)}</td>
                        <td className="p-2 text-right font-bold">{fmt(r.totalAmount)}</td>
                        <td className="p-2 text-center">
                          {canWrite && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setActiveUpload({
                                  targetType: r.source,
                                  targetId: r.sourceRefId,
                                  invoiceNo: r.invoiceNo,
                                  partyName: r.clientName,
                                })
                              }
                              className="h-6 text-[10px] gap-1"
                            >
                              <Upload className="h-2.5 w-2.5" /> Attach Scan
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Upload Modal */}
      <Dialog open={!!activeUpload} onOpenChange={() => setActiveUpload(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              Attach Scanned Bill: {activeUpload?.invoiceNo}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUploadSubmit} className="space-y-3.5 py-2">
            <div className="p-2.5 bg-muted/40 rounded border text-xs font-mono">
              <span className="text-muted-foreground">Party / Supplier: </span>
              <span className="font-bold text-foreground">{activeUpload?.partyName}</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Select Scanned Invoice (PDF or Image, Max 10MB) *</Label>
              <Input
                type="file"
                accept="application/pdf,image/*"
                onChange={handleFileChange}
                className="h-9 text-xs file:text-xs"
                required
              />
              {fileName && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                  <Paperclip className="h-3 w-3 text-primary" /> {fileName}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveUpload(null)}
                disabled={attachMut.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={attachMut.isPending}>
                {attachMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Upload &amp; Verify Bill
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
