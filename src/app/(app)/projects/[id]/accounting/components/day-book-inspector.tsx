"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import {
  X,
  PencilLine,
  Undo2,
  Paperclip,
  Eye,
  ExternalLink,
  User,
  Building2,
  ReceiptText,
  Wallet,
  Hash,
  Boxes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNpr } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { sanitizeUrl } from "@/lib/safe-url";

export type LedgerEntry = {
  id?: string;
  source?: "payment" | "vendor_bill" | "subcontractor_bill" | "ipc" | "site_expense" | "head_office_expense";
  date: string;
  miti?: string;
  voucherNo?: string;
  voucherType?: string;
  particulars?: string;
  accountHead?: string;
  paymentMode?: string;
  projectCode?: string;
  projectId?: string | null;
  debit?: number;
  credit?: number;
  party?: string;
  pan?: string;
  partyPan?: string;
  runningBalance?: number;
  attachmentUrl?: string;
  createdAt?: string;
};

export type LedgerAttachFile = {
  data: string;
  fileName: string;
  fileType: string;
  fileSize: number;
};

export function DayBookInspector({
  entry,
  open,
  onClose,
  onEdit,
  onReverse,
  onAttach,
}: {
  entry: LedgerEntry | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (e: LedgerEntry) => void;
  onReverse?: (e: LedgerEntry) => void;
  onAttach?: (entry: LedgerEntry, file: LedgerAttachFile) => void;
}) {
  const isInflow = (entry?.debit ?? 0) > 0;
  const amount = isInflow ? entry?.debit ?? 0 : entry?.credit ?? 0;

  const pretty = useMemo(() => {
    if (!entry) return null;
    const dt = entry.date ? new Date(entry.date) : null;
    const weekday = dt?.toLocaleDateString("en-GB", { weekday: "short" }) ?? "";
    const day = dt?.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) ?? "";
    return { weekday, day };
  }, [entry]);

  if (!open || !entry) return null;

  const pan = entry.pan || entry.partyPan;
  const attachment = entry.attachmentUrl ? sanitizeUrl(entry.attachmentUrl) : null;

  const fields: { label: string; value: React.ReactNode; icon?: React.ReactNode }[] = [
    {
      label: "Date",
      value: (
        <div className="text-left">
          <div className="text-foreground font-bold">{entry.miti || pretty?.day}</div>
          <div className="text-[10px] text-muted-foreground">{pretty?.weekday}</div>
        </div>
      ),
      icon: <Hash className="h-3.5 w-3.5" />,
    },
    {
      label: isInflow ? "Received From" : "Payee",
      value: <span className="text-foreground font-medium">{entry.party || "—"}</span>,
      icon: <User className="h-3.5 w-3.5" />,
    },
    {
      label: "Amount",
      value: (
        <span className={isInflow ? "text-success font-bold font-matrix" : "text-rose-600 font-bold font-matrix"}>
          NPR {formatNpr(amount)}
        </span>
      ),
      icon: <Wallet className="h-3.5 w-3.5" />,
    },
    {
      label: "From (Mode)",
      value: <span className="capitalize text-foreground/90">{entry.paymentMode?.replace(/_/g, " ") || "—"}</span>,
      icon: <Building2 className="h-3.5 w-3.5" />,
    },
    {
      label: "Project",
      value: <span className="font-mono text-foreground/90">{entry.projectCode || "All"}</span>,
    },
    {
      label: "Account Head",
      value: <span className="text-foreground/90">{entry.accountHead || "—"}</span>,
      icon: <Boxes className="h-3.5 w-3.5" />,
    },
    {
      label: "VAT / PAN",
      value: <span className="font-mono text-foreground/90">{pan || "—"}</span>,
    },
    {
      label: "Running Balance",
      value: <span className="font-bold font-matrix text-foreground">{formatNpr(entry.runningBalance ?? 0)}</span>,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 font-mono">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] uppercase font-bold",
                isInflow ? "bg-success/10 text-success border-success/30" : "bg-rose-50 text-rose-600 border-rose-200"
              )}
            >
              {entry.voucherType || (isInflow ? "Inflow" : "Payment")}
            </Badge>
            {entry.voucherNo && <span className="text-[10px] font-bold text-foreground/70">#{entry.voucherNo}</span>}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{entry.particulars || "—"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-lg border border-[var(--border)] bg-card level-2-surface p-3">
        {fields.map((f) => (
          <div key={f.label} className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground/70">{f.icon}</span>
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">{f.label}</div>
              <div className="truncate text-xs">{f.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Allocation / Source */}
      <div className="space-y-2">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Allocation</div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[9px] bg-muted border-[var(--border)] text-foreground/80">
            <Boxes className="mr-1 h-3 w-3" /> {entry.accountHead || "General"}
          </Badge>
          <Badge variant="outline" className="text-[9px] bg-muted border-[var(--border)] text-foreground/80">
            <Building2 className="mr-1 h-3 w-3" /> {entry.projectCode || "Org"}
          </Badge>
        </div>
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Source</div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <ReceiptText className="h-3.5 w-3.5" />
          {entry.voucherNo ? `Voucher #${entry.voucherNo}` : "Manual entry"} · {isInflow ? "Debit (inflow)" : "Credit (outflow)"}
        </div>
      </div>

      {/* Attachments */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Attachments</div>
          {onAttach && (
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] bg-muted px-1.5 py-0.5 text-[9px] font-bold text-foreground/80 hover:bg-muted/70">
              <Paperclip className="h-3 w-3" /> Attach
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file || !onAttach) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const data = String(reader.result || "").split(",")[1] || "";
                    onAttach(entry, { data, fileName: file.name, fileType: file.type || "application/octet-stream", fileSize: file.size });
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        <div className="space-y-1.5">
          {attachment ? (
            <a
              href={attachment}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-card p-2 text-[10px] text-foreground hover:border-primary/50"
            >
              <Eye className="h-3.5 w-3.5 text-primary" />
              <span className="truncate">Scanned bill</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </a>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--border)] p-2 text-[10px] text-muted-foreground">
              No attachment scanned yet.
            </div>
          )}
        </div>
      </div>

      {/* Audit */}
      <div className="space-y-2">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Audit Trail</div>
        <div className="rounded-md border border-[var(--border)] bg-card p-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-3.5 w-3.5 text-muted-foreground/70" />
            {entry.voucherType || "Journal"} voucher
            {entry.createdAt ? ` · ${format(new Date(entry.createdAt), "dd MMM yyyy")}` : ""}
          </div>
          <div className="mt-1 text-[9px] text-muted-foreground/60">
            Recorded on {entry.date ? format(new Date(entry.date), "dd MMM yyyy, HH:mm") : "—"}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2 border-t border-[var(--border)] pt-2">
        {onEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-[10px] font-bold"
            onClick={() => onEdit(entry)}
          >
            <PencilLine className="h-3 w-3" /> Edit Voucher
          </Button>
        )}
        {onReverse && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 flex-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            onClick={() => onReverse(entry)}
          >
            <Undo2 className="h-3 w-3" /> Reverse
          </Button>
        )}
      </div>
    </div>
  );
}
