"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Loader2, FileSpreadsheet, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export function CsvImportForm({ projectId, onSuccess }: { projectId: string; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Array<Record<string, string>>>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const utils = trpc.useUtils();
  const bulkCreate = trpc.workflow.rfi.bulkCreate.useMutation({
    onSuccess: () => {
      utils.workflow.rfi.list.invalidate({ projectId });
      toast.success("RFI(s) imported successfully");
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f); setError(null); setParsing(true);
    try {
      const text = await f.text();
      const lines = text.trim().split("\n");
      if (lines.length < 2) throw new Error("CSV must have header and at least one data row");
      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      const rows: Array<Record<string, string>> = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
        rows.push(row);
      }
      setPreview(rows); setRowCount(rows.length);
    } catch (e: any) { setError(e.message); }
    finally { setParsing(false); }
  };

  const handleImport = async () => {
    if (!preview.length) return;
    setImporting(true); setError(null);
    const rfis = preview.map(row => ({
      number: row.number || row["RFI #"] || row["RFI Number"] || "",
      subject: row.subject || row.Subject || "",
      description: row.description || row.Description || undefined,
      location: row.location || row.Location || undefined,
      priority: (row.priority || row.Priority || "normal").toLowerCase() as any,
      discipline: (row.discipline || row.Discipline || "none").toLowerCase() as any,
      workDate: row.workDate || row["Work Date"] || undefined,
      costImpact: (row.costImpact || row["Cost Impact"] || "false").toLowerCase() === "true",
      scheduleImpact: (row.scheduleImpact || row["Schedule Impact"] || "false").toLowerCase() === "true",
      status: (row.status || row.Status || "draft").toLowerCase() as any,
    })).filter(r => r.number && r.subject);
    if (!rfis.length) { setError("No valid RFI rows found"); setImporting(false); return; }
    await bulkCreate.mutateAsync({ projectId, rfis });
    setImporting(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="border-2 border-dashed rounded-lg p-6 text-center">
        <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="csv-input" />
        <label htmlFor="csv-input" className="cursor-pointer">
          {parsing ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Parsing...
            </div>
          ) : file ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span>{file.name}</span>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setFile(null); setPreview([]); setRowCount(0); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Select CSV file</span>
              <span className="text-xs text-muted-foreground">Required: number, subject</span>
            </div>
          )}
        </label>
      </div>
      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded"><AlertCircle className="h-4 w-4" /> {error}</div>}
      {preview.length > 0 && (
        <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
          <div className="bg-muted px-3 py-2 text-xs font-medium">Preview ({rowCount} rows)</div>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/50">
              <tr><th className="px-2 py-1 text-left">#</th><th className="px-2 py-1 text-left">Number</th><th className="px-2 py-1 text-left">Subject</th><th className="px-2 py-1 text-left">Priority</th><th className="px-2 py-1 text-left">Discipline</th><th className="px-2 py-1 text-left">Status</th></tr>
            </thead>
            <tbody>
              {preview.slice(0, 20).map((row, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-1">{idx + 1}</td>
                  <td className="px-2 py-1 font-mono">{row.number || row["RFI #"] || ""}</td>
                  <td className="px-2 py-1 max-w-[200px] truncate">{row.subject || ""}</td>
                  <td className="px-2 py-1 capitalize">{row.priority || "normal"}</td>
                  <td className="px-2 py-1 capitalize">{row.discipline || "none"}</td>
                  <td className="px-2 py-1 capitalize">{row.status || "draft"}</td>
                </tr>
              ))}
              {preview.length > 20 && <tr><td colSpan={6} className="px-2 py-1 text-center text-muted-foreground text-xs">...and {preview.length - 20} more</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={() => onSuccess()} disabled={importing}>Cancel</Button>
        <Button onClick={handleImport} disabled={importing || !preview.length || parsing}>
          {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Import"} ({rowCount} RFIs)
        </Button>
      </div>
    </div>
  );
}
