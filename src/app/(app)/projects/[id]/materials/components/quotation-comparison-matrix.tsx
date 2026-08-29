"use client";

import { Printer, AlertTriangle, Building2, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNpr } from "@/lib/currency";

interface QuoteItem {
  partnerId: string;
  partnerName: string;
  exFactoryRate: number;
  transportRate: number;
  totalRate: number;
  isLowest: boolean;
  isSelected: boolean;
  notes?: string | null;
}

interface QuotationComparisonMatrixProps {
  requisitionNumber: string;
  requisitionDate: Date | string;
  items: {
    id: string;
    materialName: string;
    subCategory?: string | null;
    quantity: number;
    unit: string;
    selectedPartnerId: string;
    justification?: string | null;
    quotes: {
      partnerId: string;
      partner: { name: string; phone?: string | null; email?: string | null };
      exFactoryRate: number;
      transportRate: number;
      notes?: string | null;
    }[];
  }[];
}

export function QuotationComparisonMatrix({ requisitionNumber, items }: QuotationComparisonMatrixProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
        <div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <span>Quotation Comparative Statement (CS Matrix)</span>
            <Badge variant="outline" className="font-mono text-xs">{requisitionNumber}</Badge>
          </h3>
          <p className="text-xs text-muted-foreground">3-Vendor rate comparison and lowest bidder evaluation</p>
        </div>
        <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5 h-8 text-xs shrink-0 print:hidden font-mono">
          <Printer className="h-3.5 w-3.5" />
          Print Statement
        </Button>
      </div>

      <div className="space-y-8">
        {items.map((item, itemIdx) => {
          // Process quotes to find L1, L2, L3
          const parsedQuotes: QuoteItem[] = item.quotes.map((q) => {
            const totalRate = q.exFactoryRate + q.transportRate;
            return {
              partnerId: q.partnerId,
              partnerName: q.partner?.name || "Vendor",
              exFactoryRate: q.exFactoryRate,
              transportRate: q.transportRate,
              totalRate,
              isLowest: false,
              isSelected: q.partnerId === item.selectedPartnerId,
              notes: q.notes,
            };
          });

          // Sort to find lowest
          const sorted = [...parsedQuotes].sort((a, b) => a.totalRate - b.totalRate);
          const minRate = sorted[0]?.totalRate || 0;

          parsedQuotes.forEach((q) => {
            if (q.totalRate === minRate) q.isLowest = true;
          });

          const selectedQuote = parsedQuotes.find((q) => q.isSelected);
          const isHigherThanLowest = selectedQuote && selectedQuote.totalRate > minRate;

          return (
            <div key={item.id} className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
              <div className="p-3.5 bg-muted/40 border-b flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs font-mono">
                    {itemIdx + 1}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">{item.materialName}</h4>
                    {item.subCategory && <p className="text-xs text-muted-foreground">{item.subCategory}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="font-medium text-muted-foreground font-mono">
                    Required Quantity: <strong className="text-foreground">{item.quantity.toLocaleString("en-IN")} {item.unit}</strong>
                  </span>
                </div>
              </div>

              {/* Matrix Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono tabular-nums">
                  <thead className="bg-muted/20 border-b text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-medium">Vendor / Supplier</th>
                      <th className="py-2.5 px-3 text-right font-medium">Ex-Factory Rate</th>
                      <th className="py-2.5 px-3 text-right font-medium">Freight / Transport</th>
                      <th className="py-2.5 px-3 text-right font-medium">Landed Rate</th>
                      <th className="py-2.5 px-3 text-right font-medium">Total Cost</th>
                      <th className="py-2.5 px-3 text-center font-medium w-28">Evaluation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {parsedQuotes.map((q) => {
                      const totalCost = q.totalRate * item.quantity;
                      return (
                        <tr
                          key={q.partnerId}
                          className={q.isSelected ? "bg-emerald-50/50 dark:bg-emerald-950/20 font-medium" : "hover:bg-muted/10"}
                        >
                          <td className="py-2.5 px-3 font-sans">
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-semibold text-foreground">{q.partnerName}</span>
                              {q.isSelected && (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 text-[10px] py-0 px-1.5 h-4 font-mono">
                                  Selected
                                </Badge>
                              )}
                            </div>
                            {q.notes && <p className="text-[11px] text-muted-foreground pl-5 font-mono">{q.notes}</p>}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatNpr(q.exFactoryRate)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatNpr(q.transportRate)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-foreground">
                            {formatNpr(q.totalRate)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-primary">
                            {formatNpr(totalCost)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {q.isLowest ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-mono text-[10px] gap-1 py-0 px-2 font-bold">
                                <TrendingDown className="h-3 w-3" /> L1 (Lowest)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground py-0 px-1.5">
                                +{(((q.totalRate - minRate) / minRate) * 100).toFixed(1)}%
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Justification Box if L1 was not picked */}
              {isHigherThanLowest && (
                <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200 font-mono">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Higher-Rate Selection Justification:</span>
                    <p className="mt-0.5 text-muted-foreground dark:text-amber-300/80 font-sans">
                      {item.justification || "No explicit justification provided."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
