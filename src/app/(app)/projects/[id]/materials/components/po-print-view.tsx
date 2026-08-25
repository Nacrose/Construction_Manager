"use client";

import { useRef } from "react";
import { format } from "date-fns";
import { Printer, Download, Building2, Phone, Mail, FileText, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface POPrintViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: {
    id: string;
    number: string;
    orderDate: Date | string;
    expectedDate?: Date | string | null;
    status: string;
    totalAmount: number;
    vatPercent?: number;
    vatAmount?: number;
    netAmount?: number;
    deliveryTerms?: string | null;
    paymentTerms?: string | null;
    remarks?: string | null;
    project?: {
      name: string;
      code: string;
      client?: string | null;
      location?: string | null;
    } | null;
    partner?: {
      name: string;
      contact?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      pan?: string | null;
    } | null;
    supplier?: {
      name: string;
      contact?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      pan?: string | null;
    } | null;
    items: {
      id: string;
      quantity: number;
      unit: string;
      rate: number;
      amount: number;
      material: {
        name: string;
        code?: string | null;
        subCategory?: string | null;
      };
    }[];
  } | null;
}

export function POPrintView({ open, onOpenChange, po }: POPrintViewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!po) return null;

  const vendor = po.partner || po.supplier || { name: "Unknown Vendor" };
  const vatRate = po.vatPercent ?? 13;
  const subtotal = po.totalAmount;
  const vat = po.vatAmount ?? (subtotal * vatRate) / 100;
  const grandTotal = po.netAmount ?? (subtotal + vat);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 print:p-0 print:border-none print:shadow-none">
        <DialogHeader className="p-4 bg-muted/40 border-b flex flex-row items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <DialogTitle className="text-base font-semibold">Purchase Order #{po.number}</DialogTitle>
          </div>
          <div className="flex items-center gap-2 pr-6">
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5 h-8">
              <Printer className="h-4 w-4" />
              Print / Save PDF
            </Button>
          </div>
        </DialogHeader>

        {/* Printable Document Body */}
        <div ref={printRef} className="p-8 text-foreground bg-background space-y-6 text-sm">
          {/* Header */}
          <div className="flex justify-between items-start border-b pb-6">
            <div>
              <h2 className="text-2xl font-bold text-primary tracking-tight">PURCHASE ORDER</h2>
              <p className="text-xs text-muted-foreground mt-1">Official Construction Procurement Document</p>
              <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">{po.project?.name || "Construction Project"}</p>
                <p>Project Code: {po.project?.code || "N/A"}</p>
                {po.project?.location && <p>Site Location: {po.project.location}</p>}
                {po.project?.client && <p>Employer/Client: {po.project.client}</p>}
              </div>
            </div>

            <div className="text-right space-y-1.5">
              <div className="inline-block px-3 py-1 bg-primary/10 border border-primary/20 rounded-md font-mono text-base font-bold text-primary">
                {po.number}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Date:</span> {format(new Date(po.orderDate), "dd MMM yyyy")}
              </p>
              {po.expectedDate && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Delivery Required By:</span> {format(new Date(po.expectedDate), "dd MMM yyyy")}
                </p>
              )}
              <div className="pt-1">
                <Badge variant="outline" className="uppercase font-mono text-[10px]">
                  Status: {po.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* Parties Grid */}
          <div className="grid grid-cols-2 gap-6 p-4 rounded-lg bg-muted/20 border text-xs">
            <div>
              <h4 className="font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" /> Vendor / Supplier
              </h4>
              <p className="font-semibold text-sm text-foreground">{vendor.name}</p>
              {vendor.address && <p className="text-muted-foreground mt-0.5">{vendor.address}</p>}
              {vendor.pan && <p className="mt-1 font-mono"><span className="text-muted-foreground">PAN/VAT No:</span> {vendor.pan}</p>}
              {vendor.contact && <p className="text-muted-foreground">Attn: {vendor.contact}</p>}
              {vendor.phone && <p className="text-muted-foreground">Tel: {vendor.phone}</p>}
              {vendor.email && <p className="text-muted-foreground">Email: {vendor.email}</p>}
            </div>

            <div>
              <h4 className="font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Delivery & Billing Destination
              </h4>
              <p className="font-semibold text-sm text-foreground">{po.project?.name || "Project Site Store"}</p>
              <p className="text-muted-foreground mt-0.5">Site Material Store & Receiving Yard</p>
              <p className="text-muted-foreground">Location: {po.project?.location || "Project Site"}</p>
              {po.deliveryTerms && (
                <p className="mt-2 text-foreground font-medium"><span className="text-muted-foreground">Delivery Terms:</span> {po.deliveryTerms}</p>
              )}
              {po.paymentTerms && (
                <p className="text-foreground font-medium"><span className="text-muted-foreground">Payment Terms:</span> {po.paymentTerms}</p>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 border-b">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold text-muted-foreground w-10">SN</th>
                  <th className="py-2.5 px-3 text-left font-semibold text-muted-foreground">Material & Specification</th>
                  <th className="py-2.5 px-3 text-center font-semibold text-muted-foreground w-20">Unit</th>
                  <th className="py-2.5 px-3 text-right font-semibold text-muted-foreground w-24">Quantity</th>
                  <th className="py-2.5 px-3 text-right font-semibold text-muted-foreground w-28">Rate (NPR)</th>
                  <th className="py-2.5 px-3 text-right font-semibold text-muted-foreground w-32">Amount (NPR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {po.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-muted/10">
                    <td className="py-2.5 px-3 font-mono text-muted-foreground">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-foreground">{item.material.name}</p>
                      {item.material.subCategory && (
                        <p className="text-[11px] text-muted-foreground">{item.material.subCategory}</p>
                      )}
                      {item.material.code && (
                        <span className="font-mono text-[10px] text-muted-foreground">Code: {item.material.code}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{item.unit}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium">{item.quantity.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{item.rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financials & Summary */}
          <div className="flex justify-end pt-2">
            <div className="w-72 space-y-2 text-xs border rounded-lg p-3 bg-muted/20">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal (Ex-VAT):</span>
                <span className="font-mono font-medium text-foreground">NPR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>VAT ({vatRate}%):</span>
                <span className="font-mono font-medium text-foreground">NPR {vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-sm text-foreground">
                <span>Grand Total (Net):</span>
                <span className="font-mono text-primary">NPR {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="border-t pt-4 space-y-2 text-xs text-muted-foreground">
            <h5 className="font-bold text-foreground uppercase tracking-wider text-[11px]">Terms & Conditions:</h5>
            <ol className="list-decimal pl-4 space-y-1 text-[11px]">
              <li>All materials supplied must strictly adhere to project technical specifications and standard IS / Nepal engineering codes.</li>
              <li>Delivery challans and tax invoices must accompany each consignment along with vehicle weighbridge slips.</li>
              <li>Materials are subject to on-site physical inspection and standard laboratory test acceptance.</li>
              <li>The purchase order number ({po.number}) must be referenced on all delivery challans and billing correspondence.</li>
            </ol>
            {po.remarks && (
              <p className="pt-1 text-[11px]"><span className="font-semibold text-foreground">Special Instructions:</span> {po.remarks}</p>
            )}
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs">
            <div className="border-t pt-2">
              <p className="font-semibold text-foreground">Prepared By</p>
              <p className="text-[11px] text-muted-foreground">Procurement Officer</p>
            </div>
            <div className="border-t pt-2">
              <p className="font-semibold text-foreground">Verified By</p>
              <p className="text-[11px] text-muted-foreground">Project Manager / Resident Eng.</p>
            </div>
            <div className="border-t pt-2">
              <p className="font-semibold text-foreground">Accepted By</p>
              <p className="text-[11px] text-muted-foreground">Supplier Authorized Representative</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
