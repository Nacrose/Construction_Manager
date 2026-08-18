"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ReceiptText, FileQuestion, ArrowRight } from "lucide-react";
import Link from "next/link";

export function DrawingComparatorPane({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<"boq" | "rfis">("boq");
  const [search, setSearch] = useState("");

  const { data: boqData, isLoading: boqLoading } = trpc.boq.list.useQuery({ projectId });
  const { data: rfiData, isLoading: rfiLoading } = trpc.workflow.rfi.list.useQuery({ projectId });

  const filteredBoq = (boqData?.items ?? []).filter(
    (i) =>
      i.code.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredRfis = (rfiData?.rfis ?? []).filter(
    (r) =>
      r.number.toLowerCase().includes(search.toLowerCase()) ||
      r.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-card/90 border-l border-border font-mono text-xs overflow-hidden">
      {/* Header Tabs */}
      <div className="flex items-center border-b border-border bg-muted/60 p-2 gap-2">
        <button
          onClick={() => setTab("boq")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
            tab === "boq" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ReceiptText className="h-3.5 w-3.5" /> BOQ Items ({boqData?.items.length ?? 0})
        </button>
        <button
          onClick={() => setTab("rfis")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
            tab === "rfis" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileQuestion className="h-3.5 w-3.5" /> Linked RFIs ({rfiData?.rfis.length ?? 0})
        </button>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-border/60">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={`Filter ${tab.toUpperCase()} items...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-[11px] font-mono"
          />
        </div>
      </div>

      {/* Content List */}
      <div className="flex-1 overflow-y-auto p-2">
        {tab === "boq" ? (
          boqLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading BOQ items…</div>
          ) : filteredBoq.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">No BOQ items match filter.</div>
          ) : (
            <div className="space-y-1">
              {filteredBoq.map((item) => (
                <div key={item.id} className="p-2 rounded border border-border/60 bg-muted/30 hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-primary">{item.code}</span>
                    <span className="text-muted-foreground">{item.quantity} {item.unit}</span>
                  </div>
                  <p className="text-[10px] text-foreground truncate mt-0.5">{item.description}</p>
                  <div className="text-[10px] text-right font-bold text-foreground mt-1">
                    NPR {item.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          rfiLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading RFIs…</div>
          ) : filteredRfis.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">No RFIs found.</div>
          ) : (
            <div className="space-y-1">
              {filteredRfis.map((rfi) => (
                <Link
                  key={rfi.id}
                  href={`/projects/${projectId}/workflow/rfi`}
                  className="block p-2 rounded border border-border/60 bg-muted/30 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-primary">{rfi.number}</span>
                    <span className="text-[9px] uppercase px-1 py-0.5 rounded border border-border text-muted-foreground">
                      {rfi.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-foreground truncate mt-0.5">{rfi.subject}</p>
                </Link>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
