"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Lightbulb, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function KbSuggestions({
  rfis,
}: {
  rfis: Array<{
    id: string;
    number: string;
    subject: string;
    discipline: string | null;
    status: string;
    createdAt: string | Date;
    createdBy: { name: string };
    responses: Array<{ decision: string; response: string; createdAt: string | Date }>;
  }>;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(true);

  if (!rfis || rfis.length === 0) return null;

  return (
    <div className="rounded border border-amber-500/40 bg-amber-500/10 overflow-hidden font-mono">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
        {rfis.length} similar RFI{rfis.length > 1 ? "s" : ""} detected in knowledge base
        {open ? (
          <ChevronDown className="h-3 w-3 ml-auto" />
        ) : (
          <ChevronRight className="h-3 w-3 ml-auto" />
        )}
      </button>
      {open && (
        <div className="divide-y divide-amber-500/20">
          {rfis.map((rfi) => (
            <div key={rfi.id} className="px-3 py-2">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono text-muted-foreground">{rfi.number}</span>
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border",
                    rfi.status === "approved"
                      ? "border-success/40 text-success/80 bg-success/10"
                      : rfi.status === "rejected"
                        ? "border-destructive/40 text-destructive bg-destructive/10"
                        : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                  )}
                >
                  {rfi.status}
                </span>
                {rfi.discipline && (
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {rfi.discipline}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-medium text-foreground leading-tight">{rfi.subject}</p>
              {rfi.responses[0] && (
                <div className="mt-1 flex items-start gap-1.5">
                  <span className="text-[10px] font-bold text-primary shrink-0">Response:</span>
                  <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
                    {rfi.responses[0].response}
                  </span>
                </div>
              )}
              <p className="text-[9px] text-muted-foreground mt-1">
                by {rfi.createdBy.name} · {format(new Date(rfi.createdAt), "MMM d, yyyy")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
