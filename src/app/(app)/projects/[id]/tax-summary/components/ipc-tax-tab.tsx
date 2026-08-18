"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, TrendingUp, TrendingDown, Calendar, Loader2 } from "lucide-react";
import Link from "next/link";
import { fmt, monthLabel } from "./helpers";

export function IpcTaxTab({ query }: { query: any }) {
  if (query.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totals = query.data?.totals;
  const ipcs = query.data?.ipcs ?? [];
  const byMonth = query.data?.byMonth ?? [];

  if (!totals || totals.count === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto h-10 w-10 mb-2 opacity-50" />
          No IPCs found for the selected filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Gross</p>
          <p className="mt-1 text-lg font-semibold">NPR {fmt(totals.totalGross)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{totals.count} IPCs</p>
        </Card>
        <Card className="p-4 border-amber-200 bg-amber-50/30">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> VAT Collected
          </p>
          <p className="mt-1 text-lg font-semibold text-amber-700 dark:text-amber-400">
            NPR {fmt(totals.totalVat)}
          </p>
        </Card>
        <Card className="p-4 border-red-200 bg-red-50/10">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> TDS Deducted
          </p>
          <p className="mt-1 text-lg font-semibold text-red-600">
            NPR {fmt(totals.totalTds)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Retention</p>
          <p className="mt-1 text-lg font-semibold text-amber-600">
            NPR {fmt(totals.totalRetention)}
          </p>
        </Card>
        <Card className="p-4 border-emerald-300 dark:border-emerald-800 bg-emerald-50/20">
          <p className="text-xs text-muted-foreground">Total Final Payable</p>
          <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-400">
            NPR {fmt(totals.totalFinalPayable)}
          </p>
        </Card>
      </div>

      {byMonth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Monthly Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">TDS</TableHead>
                  <TableHead className="text-right">Retention</TableHead>
                  <TableHead className="text-right">Final Payable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byMonth.map((m: any) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{monthLabel(m.month)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(m.grossAmount)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">{fmt(m.vatAmount)}</TableCell>
                    <TableCell className="text-right font-mono text-red-600">{fmt(m.tdsAmount)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(m.retentionAmount)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmt(m.finalPayable)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Per-IPC Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IPC #</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subcontractor</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">VAT %</TableHead>
                <TableHead className="text-right">VAT Amt</TableHead>
                <TableHead className="text-right">TDS %</TableHead>
                <TableHead className="text-right">TDS Amt</TableHead>
                <TableHead className="text-right">Final Payable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ipcs.map((ipc: any) => (
                <TableRow key={ipc.id}>
                  <TableCell>
                    <Link href={`/projects/${ipc.projectId ?? ""}/ipc/${ipc.id}`} className="font-mono text-xs text-amber-600 hover:underline">
                      {ipc.number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{ipc.period ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">{ipc.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{ipc.subcontractorName ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{fmt(ipc.grossAmount)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{ipc.vatPercent ?? 0}%</TableCell>
                  <TableCell className="text-right font-mono text-xs text-amber-700 dark:text-amber-400">{fmt(ipc.vatAmount ?? 0)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{ipc.tdsPercent ?? 0}%</TableCell>
                  <TableCell className="text-right font-mono text-xs text-red-600">{fmt(ipc.tdsAmount ?? 0)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold">{fmt(ipc.finalPayable ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
