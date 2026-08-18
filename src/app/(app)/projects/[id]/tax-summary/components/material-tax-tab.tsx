"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Package, TrendingUp, TrendingDown, Building2, Calendar, Loader2 } from "lucide-react";
import { fmt, monthLabel } from "./helpers";

export function MaterialTaxTab({ query }: { query: any }) {
  if (query.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totals = query.data?.totals;
  const bySupplier = query.data?.bySupplier ?? [];
  const byMonth = query.data?.byMonth ?? [];

  if (!totals || totals.count === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Package className="mx-auto h-10 w-10 mb-2 opacity-50" />
          No material receive transactions with tax found.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Base Amount</p>
          <p className="mt-1 text-lg font-semibold">NPR {fmt(totals.totalBaseAmount)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{totals.count} transactions</p>
        </Card>
        <Card className="p-4 border-amber-200 bg-amber-50/30">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> VAT Collected
          </p>
          <p className="mt-1 text-lg font-semibold text-amber-700 dark:text-amber-400">
            NPR {fmt(totals.totalVatAmount)}
          </p>
        </Card>
        <Card className="p-4 border-red-200 bg-red-50/10">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> TDS Deducted
          </p>
          <p className="mt-1 text-lg font-semibold text-red-600">
            NPR {fmt(totals.totalTdsAmount)}
          </p>
        </Card>
        <Card className="p-4 border-emerald-300 dark:border-emerald-800 bg-emerald-50/20">
          <p className="text-xs text-muted-foreground">Total Net Payable</p>
          <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-400">
            NPR {fmt(totals.totalNetPayable)}
          </p>
        </Card>
      </div>

      {bySupplier.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> By Supplier (PAN)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier PAN</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Txns</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">TDS</TableHead>
                  <TableHead className="text-right">Net Payable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySupplier.map((s: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{s.supplierPan ?? "—"}</TableCell>
                    <TableCell className="text-xs">{s.supplierInvoiceNo ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs">{s.count}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmt(s.baseAmount)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-amber-700 dark:text-amber-400">{fmt(s.vatAmount)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-red-600">{fmt(s.tdsAmount)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">{fmt(s.netPayable)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">TDS</TableHead>
                  <TableHead className="text-right">Net Payable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byMonth.map((m: any) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{monthLabel(m.month)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(m.baseAmount)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">{fmt(m.vatAmount)}</TableCell>
                    <TableCell className="text-right font-mono text-red-600">{fmt(m.tdsAmount)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmt(m.netPayable)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
