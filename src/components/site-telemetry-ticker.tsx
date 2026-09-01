"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import { useFXStore } from "@/lib/fx-store";
import {
  Radio, Volume2, VolumeX, Terminal, Sparkles, Maximize2, Minimize2,
  Calendar as CalendarIcon, FileQuestion, ShieldAlert,
} from "lucide-react";
import { AtmosphericControllerDialog } from "@/components/fx/atmospheric-controller-dialog";
import { cn } from "@/lib/utils";
import { getCurrentBsDate, type NepaliDate } from "@/lib/nepali-calendar";
import { NepaliCalendar } from "@/components/ui/nepali-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUserPreferences } from "@/components/user-preferences-provider";

export function SiteTelemetryTicker() {
  const pathname = usePathname();
  const router = useRouter();
  const [timeStr, setTimeStr] = useState("");
  const [fxDialogOpen, setFxDialogOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bsDate, setBsDate] = useState<NepaliDate>(() => getCurrentBsDate());
  const fx = useFXStore();
  const { getPref, setPref } = useUserPreferences();
  const calendarType = getPref<string>("calendarType", "BS");

  const projectId = pathname?.match(/^\/projects\/([^/]+)/)?.[1] ?? null;
  const { data: projectData } = trpc.project.get.useQuery(
    { id: projectId! },
    { enabled: !!projectId, staleTime: 300_000 }
  );

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

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* Fullscreen permission denied */
    }
  };

  if (!projectId) {
    return null;
  }

  // Only render if we have project info or alerts
  return (
    <>
      <div className="w-full bg-[#e5eef7] border-b border-[#c7d8e8] px-3 py-1 text-[11px] font-mono text-slate-600 flex items-center justify-between gap-4 select-none shrink-0 z-20">
        {/* Left: Project / Site Context */}
        <div className="flex items-center gap-2 truncate min-w-0">
          <span className="font-bold text-[#0284c7] font-mono">SITE:</span>
          <span className="truncate text-slate-800 font-bold">
            {projectData?.project?.code} — {projectData?.project?.name}
          </span>
        </div>

        {/* Center / Attention Ticker Alerts */}
        {(overdueRfiCount > 0 || expiringBgCount > 0) && (
          <div className="flex items-center gap-2 shrink-0">
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
        )}

        {/* Right: Date / BS Calendar */}
        <div className="flex items-center gap-2 shrink-0">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#c5d7e8] bg-white hover:bg-sky-50 text-[#0369a1] text-[10px] font-semibold transition-all cursor-pointer font-mono shadow-xs"
                title="Bikram Sambat Nepali Calendar"
              >
                <CalendarIcon className="h-3 w-3 text-[#0284c7]" />
                <span className="font-bold font-matrix">{bsDate.displayNp}</span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-sky-100 text-[#0369a1] font-mono font-bold">BS</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border border-[#c7d8e8] shadow-2xl z-50 bg-white" align="end">
              <NepaliCalendar
                value={new Date()}
                showDualAdDate={true}
                useDevanagari={true}
              />
            </PopoverContent>
          </Popover>

          <span className="text-[10px] font-mono text-slate-500 font-matrix">
            {timeStr}
          </span>
        </div>
      </div>
    </>
  );
}
