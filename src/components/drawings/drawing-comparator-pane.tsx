"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import { formatNpr } from "@/lib/currency";
import { Search, ReceiptText, FileQuestion, Zap, Check } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DrawingComparatorPane({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<"boq" | "rfis">("boq");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const handleApplyTakeoff = (item: any) => {
    setCopiedId(item.id);
    navigator.clipboard.writeText(`${item.code} - ${item.description} (${item.quantity} ${item.unit})`);
    toast.success(`BOQ Item ${item.code} linked to active drawing takeoff sheet`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c1015] border-l border-white/10 font-mono text-xs overflow-hidden">
      {/* Header Tabs */}
      <div className="flex items-center border-b border-white/10 bg-[#121820] p-2 gap-2">
        <button
          onClick={() => setTab("boq")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${
            tab === "boq" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold" : "text-gray-400 hover:text-white"
          }`}
        >
          <ReceiptText className="h-3.5 w-3.5 text-emerald-400" /> BOQ Takeoff Items ({boqData?.items.length ?? 0})
        </button>
        <button
          onClick={() => setTab("rfis")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${
            tab === "rfis" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold" : "text-gray-400 hover:text-white"
          }`}
        >
          <FileQuestion className="h-3.5 w-3.5 text-cyan-400" /> Linked RFIs ({rfiData?.rfis.length ?? 0})
        </button>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-white/10 bg-[#0c1015]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder={`Filter ${tab.toUpperCase()} items...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs font-mono bg-[#161d26] border-white/10 text-white rounded-xl"
          />
        </div>
      </div>

      {/* Content List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tab === "boq" ? (
          boqLoading ? (
            <div className="p-4 text-center text-gray-400">Loading BOQ items…</div>
          ) : filteredBoq.length === 0 ? (
            <div className="p-4 text-center text-gray-400">No BOQ items match filter.</div>
          ) : (
            <div className="space-y-1.5">
              {filteredBoq.map((item) => (
                <div key={item.id} className="p-2.5 rounded-xl border border-white/10 bg-[#121820]/80 hover:border-emerald-500/40 transition-all group">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-400">{item.code}</span>
                    <span className="text-gray-300 font-mono">{item.quantity} {item.unit}</span>
                  </div>
                  <p className="text-[11px] text-gray-300 line-clamp-2 mt-1 leading-snug">{item.description}</p>
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/5">
                    <span className="text-[11px] font-bold text-white font-mono">
                      {formatNpr(item.amount)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleApplyTakeoff(item)}
                      className="h-6 text-[10px] gap-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-2 rounded-lg"
                      title="Link and apply this BOQ item to drawing takeoff"
                    >
                      {copiedId === item.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Zap className="h-3 w-3" />}
                      Takeoff Link
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          rfiLoading ? (
            <div className="p-4 text-center text-gray-400">Loading RFIs…</div>
          ) : filteredRfis.length === 0 ? (
            <div className="p-4 text-center text-gray-400">No RFIs found.</div>
          ) : (
            <div className="space-y-1.5">
              {filteredRfis.map((rfi) => (
                <Link
                  key={rfi.id}
                  href={`/projects/${projectId}/workflow/rfi`}
                  className="block p-2.5 rounded-xl border border-white/10 bg-[#121820]/80 hover:border-cyan-500/40 transition-all"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-cyan-400">{rfi.number}</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-white/10 font-mono text-gray-300">
                      {rfi.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 truncate mt-1">{rfi.subject}</p>
                </Link>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

