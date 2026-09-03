"use client";

import { usePathname, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import { FileQuestion, ShieldAlert } from "lucide-react";

/**
 * Slim attention banner — ONLY the active alert pills (overdue RFIs,
 * expiring bank guarantees). The project name + clock/date were removed from
 * the top of the shell (they now live in the sidebar); this band appears only
 * when there is something to flag, and stays out of the way otherwise.
 */
export function SiteTelemetryTicker() {
  const pathname = usePathname();
  const router = useRouter();
  const projectId = pathname?.match(/^\/projects\/([^/]+)/)?.[1] ?? null;

  const { data: rfiData } = trpc.dashboard.rfiMetrics.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId, staleTime: 60_000 }
  );
  const { data: bgData } = trpc.bankGuarantee.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId, staleTime: 60_000 }
  );

  const overdueRfiCount = rfiData?.overdue?.length ?? 0;
  const expiringBgCount = bgData?.kpis?.expiringWithin30DaysCount ?? 0;

  if (!projectId || (overdueRfiCount === 0 && expiringBgCount === 0)) return null;

  return (
    <div className="w-full bg-[var(--background)] border-b border-[var(--border)] px-3 py-1 text-[11px] font-mono text-muted-foreground flex items-center gap-3 select-none shrink-0 z-20">
      {overdueRfiCount > 0 && (
        <button
          onClick={() => router.push(`/projects/${projectId}/rfis`)}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-amber-400 bg-amber-50 hover:bg-amber-100 text-[#b45309] text-[10px] font-bold transition-all shadow-xs cursor-pointer"
          title="Click to view Overdue RFIs"
        >
          <FileQuestion className="h-3 w-3 text-amber-600" />
          <span>{overdueRfiCount} OVERDUE RFI{overdueRfiCount > 1 ? "S" : ""}</span>
        </button>
      )}
      {expiringBgCount > 0 && (
        <button
          onClick={() => router.push(`/projects/${projectId}/guarantees`)}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-rose-400 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold transition-all shadow-xs cursor-pointer"
          title="Click to view Expiring Guarantees"
        >
          <ShieldAlert className="h-3 w-3 text-rose-600" />
          <span>{expiringBgCount} GUARANTEE{expiringBgCount > 1 ? "S" : ""} EXPIRING</span>
        </button>
      )}
    </div>
  );
}
