"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Upload,
  Eye,
  Trash2,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export function IpcScannedBillCard({
  projectId,
  ipcId,
  scannedBillUrl,
  scannedBillName,
  isBillAttached,
  taxInvoiceNo,
  canWrite = false,
  onUpdate,
}: {
  projectId: string;
  ipcId: string;
  scannedBillUrl?: string | null;
  scannedBillName?: string | null;
  isBillAttached?: boolean;
  taxInvoiceNo?: string | null;
  canWrite?: boolean;
  onUpdate?: () => void;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState(taxInvoiceNo || "");

  const attachMut = trpc.vatRegister.attachScannedBill.useMutation({
    onSuccess: () => {
      toast.success("Scanned bill uploaded successfully");
      setUploadOpen(false);
      setFileData(null);
      if (onUpdate) onUpdate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateIpcMut = trpc.ipc.update.useMutation({
    onSuccess: () => {
      if (onUpdate) onUpdate();
    },
  });

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
      const result = event.target?.result as string;
      setFileData(result);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileData) {
      toast.error("Please select a file to upload");
      return;
    }

    if (invoiceNo && invoiceNo !== taxInvoiceNo) {
      updateIpcMut.mutate({ ipcId, taxInvoiceNo: invoiceNo });
    }

    attachMut.mutate({
      projectId,
      targetType: "client_ipc",
      targetId: ipcId,
      scannedBillUrl: fileData,
      scannedBillName: fileName || "tax-invoice-scan",
    });
  };

  return (
    <>
      <Card className="border p-3.5 bg-muted/20 text-xs no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground text-sm">
                  Client Tax Invoice &amp; Signed Certificate
                </span>
                {isBillAttached && scannedBillUrl ? (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-1 text-[10px]">
                    <CheckCircle2 className="h-3 w-3" /> Attached
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 gap-1 text-[10px]">
                    <AlertTriangle className="h-3 w-3" /> Scanned Copy Pending
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-[11px]">
                {scannedBillUrl
                  ? `File: ${scannedBillName || "signed-ipc-certificate.pdf"}`
                  : "Soft mandatory requirement for statutory audit and Sales Register (Schedule 9) verification."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {scannedBillUrl && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setViewOpen(true)}
                className="h-7 text-xs gap-1"
              >
                <Eye className="h-3 w-3 text-primary" /> View Scanned Bill
              </Button>
            )}

            {canWrite && (
              <Button
                size="sm"
                variant={isBillAttached ? "outline" : "default"}
                onClick={() => setUploadOpen(true)}
                className="h-7 text-xs gap-1 shadow-xs"
              >
                <Upload className="h-3 w-3" />
                {isBillAttached ? "Replace Scan" : "Upload Scanned Bill"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Upload Scanned Copy Modal */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Upload className="h-4 w-4 text-primary" />
              Upload Scanned Client Tax Invoice / Signed Certificate
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUploadSubmit} className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Client Tax Invoice #</Label>
              <Input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="e.g. TAX-INV-2081-004"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Select Scanned File (PDF, JPEG, PNG, Max 10MB) *</Label>
              <Input
                type="file"
                accept="application/pdf,image/*"
                onChange={handleFileChange}
                className="h-9 text-xs file:text-xs"
                required
              />
              {fileName && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Paperclip className="h-3 w-3 text-primary" /> Selected: {fileName}
                </p>
              )}
            </div>

            <div className="p-2.5 bg-muted/40 rounded border text-[11px] text-muted-foreground">
              This copy will be linked directly to **बिक्री खाता (Sales Register - Schedule 9)** for IRD tax compliance.
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUploadOpen(false)}
                disabled={attachMut.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={attachMut.isPending}>
                {attachMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Save Attachment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Scanned Document Modal */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Scanned Bill: {scannedBillName || "Document"}</span>
              <a
                href={scannedBillUrl || "#"}
                download={scannedBillName || "scanned-invoice"}
                className="text-xs text-primary underline"
              >
                Download Original
              </a>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {scannedBillUrl?.startsWith("data:application/pdf") ? (
              <iframe
                src={scannedBillUrl}
                className="w-full h-[70vh] rounded border"
                title="Scanned Document"
              />
            ) : (
              <img
                src={scannedBillUrl || ""}
                alt="Scanned Bill"
                className="max-h-[75vh] w-auto mx-auto rounded border object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
