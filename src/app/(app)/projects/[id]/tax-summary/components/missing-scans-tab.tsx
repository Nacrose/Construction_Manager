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
  FileCheck,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

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
    });
  };

  const purchaseColumns: ConstructionTableColumn<any>[] = [
    {
      key: "date",
      header: "Date",
      render: (_, r) => (
        <span className="text-muted-foreground whitespace-nowrap font-mono text-xs">
          {format(new Date(r.date), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "invoiceNo",
      header: "Invoice #",
      render: (_, r) => <span className="font-bold text-foreground font-mono text-xs">{r.invoiceNo}</span>,
    },
    {
      key: "partyName",
      header: "Supplier / Vendor",
      render: (_, r) => (
        <div className="font-sans text-xs truncate max-w-[220px]">
          <span className="font-semibold text-foreground">{r.partyName}</span>
          <span className="block text-[10px] text-muted-foreground truncate font-mono">{r.description}</span>
        </div>
      ),
    },
    {
      key: "taxableLocal",
      header: "Taxable",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{formatNpr(r.taxableLocal)}</span>,
    },
    {
      key: "vatAmount",
      header: "VAT (13%)",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
          {formatNpr(r.vatAmount)}
        </span>
      ),
    },
    {
      key: "totalAmount",
      header: "Total",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs font-bold text-foreground">{formatNpr(r.totalAmount)}</span>,
    },
    {
      key: "action",
      header: "Action",
      align: "center",
      render: (_, r) =>
        canWrite ? (
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
            className="h-6 text-[10px] gap-1 font-mono"
          >
            <Upload className="h-2.5 w-2.5" /> Attach Scan
          </Button>
        ) : null,
    },
  ];

  const salesColumns: ConstructionTableColumn<any>[] = [
    {
      key: "date",
      header: "Date",
      render: (_, r) => (
        <span className="text-muted-foreground whitespace-nowrap font-mono text-xs">
          {format(new Date(r.date), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "invoiceNo",
      header: "IPC / Invoice #",
      render: (_, r) => <span className="font-bold text-foreground font-mono text-xs">{r.invoiceNo}</span>,
    },
    {
      key: "clientName",
      header: "Client / Employer",
      render: (_, r) => (
        <div className="font-sans text-xs truncate max-w-[220px]">
          <span className="font-semibold text-foreground">{r.clientName}</span>
          <span className="block text-[10px] text-muted-foreground truncate font-mono">{r.description}</span>
        </div>
      ),
    },
    {
      key: "taxableSales",
      header: "Taxable",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{formatNpr(r.taxableSales)}</span>,
    },
    {
      key: "vatAmount",
      header: "Output VAT (13%)",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
          {formatNpr(r.vatAmount)}
        </span>
      ),
    },
    {
      key: "totalAmount",
      header: "Total",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs font-bold text-foreground">{formatNpr(r.totalAmount)}</span>,
    },
    {
      key: "action",
      header: "Action",
      align: "center",
      render: (_, r) =>
        canWrite ? (
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
            className="h-6 text-[10px] gap-1 font-mono"
          >
            <Upload className="h-2.5 w-2.5" /> Attach Scan
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Alert Header Strip */}
      <div
        className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
          totalMissing > 0
            ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
        }`}
      >
        <div className="flex items-center gap-2">
          {totalMissing > 0 ? (
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          )}
          <div>
            <h3 className="text-xs font-bold font-sans">
              {totalMissing > 0
                ? `${totalMissing} Invoices Missing Digital Bill Scans (IRD Audit Risk)`
                : "100% Tax Compliant: All Invoices Have Scanned Bills Attached"}
            </h3>
            <p className="text-[11px] opacity-80 font-mono">
              IRD Nepal requires physical or digital VAT invoices to be preserved alongside tax registers for audit defense.
            </p>
          </div>
        </div>
      </div>

      {totalMissing === 0 ? (
        <div className="p-12 text-center rounded-xl border bg-card">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
          <h4 className="text-sm font-semibold text-foreground">Zero Scan Deficits</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Both your Purchase Register (Schedule 8) and Sales Register (Schedule 9) have complete digital paper trails.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Missing Purchases */}
          {missingPurchases.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-mono">
                <Package className="h-3.5 w-3.5 text-info" />
                Missing Purchase / Inward Scans ({missingPurchases.length})
              </h4>
              <ConstructionTable
                data={missingPurchases}
                columns={purchaseColumns}
                isLoading={false}
                searchPlaceholder="Search missing purchase scans..."
                searchFilterKeys={["invoiceNo", "partyName", "description"]}
              />
            </div>
          )}

          {/* Missing Sales */}
          {missingSales.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-mono">
                <FileCheck className="h-3.5 w-3.5 text-info" />
                Missing Client IPC / Sales Invoices ({missingSales.length})
              </h4>
              <ConstructionTable
                data={missingSales}
                columns={salesColumns}
                isLoading={false}
                searchPlaceholder="Search missing sales scans..."
                searchFilterKeys={["invoiceNo", "clientName", "description"]}
              />
            </div>
          )}
        </div>
      )}

      {/* Upload Scanned Bill Dialog */}
      {activeUpload && (
        <Dialog open={Boolean(activeUpload)} onOpenChange={(open) => !open && setActiveUpload(null)}>
          <DialogContent className="sm:max-w-md backdrop-blur-md bg-black/85 border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-1.5">
                <Paperclip className="h-4 w-4 text-primary" />
                Attach Scanned VAT Invoice
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleUploadSubmit} className="space-y-3 pt-2 text-xs">
              <div className="p-2.5 bg-white/5 rounded-lg border border-white/10 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-white/60">Invoice No:</span>
                  <span className="font-bold text-white">{activeUpload.invoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Party:</span>
                  <span className="font-semibold text-white">{activeUpload.partyName}</span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-white">Select File (PDF, PNG, JPG - max 10MB)</Label>
                <Input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="text-xs bg-white/5 border-white/20 text-white"
                  required
                />
                {fileName && <p className="text-[10px] text-emerald-400 font-mono">Selected: {fileName}</p>}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveUpload(null)}
                  disabled={attachMut.isPending}
                  className="font-mono text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={attachMut.isPending || !fileData}
                  className="bg-primary text-primary-foreground font-mono text-xs"
                >
                  {attachMut.isPending ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-3 w-3 mr-1" /> Upload &amp; Link
                    </>
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
