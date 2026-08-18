"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";

interface ParsedRow {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  section?: string;
}

export function ExcelPasteDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rawText, setRawText] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const utils = trpc.useUtils();

  const parseClipboard = (text: string) => {
    setRawText(text);
    if (!text.trim()) {
      setParsedRows([]);
      return;
    }

    const lines = text.trim().split(/\r?\n/);
    const rows: ParsedRow[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split("\t").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      if (cols.length < 2) continue;

      // Auto-detect header row
      if (i === 0 && (cols[0].toLowerCase().includes("item") || cols[0].toLowerCase().includes("code") || cols[1].toLowerCase().includes("desc"))) {
        continue;
      }

      let code = "";
      let desc = "";
      let unit = "Nos";
      let qty = 0;
      let rate = 0;
      let section: string | undefined = undefined;

      if (cols.length >= 5) {
        code = cols[0] || `ITEM-${rows.length + 1}`;
        desc = cols[1] || "";
        unit = cols[2] || "Nos";
        qty = parseFloat(cols[3].replace(/,/g, "")) || 0;
        rate = parseFloat(cols[4].replace(/,/g, "")) || 0;
        if (cols.length >= 6) section = cols[5];
      } else if (cols.length === 4) {
        code = cols[0];
        desc = cols[1];
        unit = "Nos";
        qty = parseFloat(cols[2].replace(/,/g, "")) || 0;
        rate = parseFloat(cols[3].replace(/,/g, "")) || 0;
      } else if (cols.length === 3) {
        code = cols[0];
        desc = cols[1];
        qty = parseFloat(cols[2].replace(/,/g, "")) || 0;
      } else {
        code = cols[0];
        desc = cols[1];
      }

      if (code && desc) {
        rows.push({
          code,
          description: desc,
          unit,
          quantity: qty,
          rate,
          amount: qty * rate,
          section,
        });
      }
    }

    setParsedRows(rows);
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;
    setIsImporting(true);

    try {
      let imported = 0;
      for (const row of parsedRows) {
        try {
          await utils.client.boq.create.mutate({
            projectId,
            code: row.code,
            description: row.description,
            unit: row.unit,
            quantity: row.quantity,
            rate: row.rate,
            section: row.section,
          });
          imported++;
        } catch {
          // continue on duplicate
        }
      }

      await utils.boq.list.invalidate({ projectId });
      toast.success(`Successfully imported ${imported} BOQ line items from Excel!`);
      onOpenChange(false);
      setRawText("");
      setParsedRows([]);
    } catch (e: any) {
      toast.error(`Import failed: ${e.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 border border-primary/40 bg-card/95 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,255,102,0.2)] rounded-lg overflow-hidden">
        <DialogHeader className="p-4 border-b border-border bg-muted/60">
          <DialogTitle className="flex items-center gap-2 font-mono text-sm uppercase text-primary">
            <FileSpreadsheet className="h-4 w-4" /> Excel Direct Paste & BOQ Ingest
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-muted-foreground">
            Copy rows from Excel or Google Sheets (Columns: Code | Description | Unit | Quantity | Rate) and paste below.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-4">
          <textarea
            autoFocus
            rows={4}
            value={rawText}
            onChange={(e) => parseClipboard(e.target.value)}
            placeholder="Paste your copied spreadsheet cells here (Cmd+V / Ctrl+V)..."
            className="w-full rounded border border-border bg-background/80 p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-primary font-bold">
                <span>PARSED PREVIEW: {parsedRows.length} ROWS</span>
                <span>
                  TOTAL: NPR{" "}
                  {parsedRows
                    .reduce((sum, r) => sum + r.amount, 0)
                    .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto rounded border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-muted/80 font-mono text-[11px]">
                      <TableHead className="w-20">Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-16">Unit</TableHead>
                      <TableHead className="w-24 text-right">Qty</TableHead>
                      <TableHead className="w-28 text-right">Rate</TableHead>
                      <TableHead className="w-32 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row, idx) => (
                      <TableRow key={idx} className="font-mono text-xs">
                        <TableCell className="font-bold text-primary">{row.code}</TableCell>
                        <TableCell className="truncate max-w-[220px]">{row.description}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell className="text-right">{row.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{row.rate.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-bold text-foreground">
                          {row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/60 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="font-mono text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleImport}
            disabled={parsedRows.length === 0 || isImporting}
            className="font-mono text-xs font-bold gap-1.5 shadow-[0_0_12px_rgba(0,255,102,0.3)]"
          >
            <Plus className="h-3.5 w-3.5" />
            {isImporting ? "Importing Items..." : `Import ${parsedRows.length} BOQ Items`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
