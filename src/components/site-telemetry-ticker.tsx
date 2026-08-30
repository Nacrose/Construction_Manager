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

  return (
    <>
      <div className="w-full bg-card/85 backdrop-blur-md border-b border-border px-3 py-1 text-[11px] font-mono text-muted-foreground flex items-center justify-between gap-4 select-none shrink-0 z-20">
        {/* Left: Project / Site Context */}
        <div className="flex items-center gap-3 truncate min-w-0">
          <div className="flex items-center gap-1.5 text-primary font-bold shrink-0">
            <Radio className="h-3.5 w-3.5 animate-pulse text-primary" />
            <span>MATRIX OS 2.0</span>
          </div>
          <span className="text-border">|</span>
          <span className="truncate text-foreground">
            {projectData?.project?.name ? (
              <span className="font-semibold text-primary/90">
                SITE: {projectData.project.code} — {projectData.project.name}
              </span>
            ) : (
              <span className="text-muted-foreground">CENTRAL COMMAND HUB</span>
            )}
          </span>
        </div>

        {/* Center / Attention Ticker Alerts */}
        {projectId && (overdueRfiCount > 0 || expiringBgCount > 0) && (
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {overdueRfiCount > 0 && (
              <button
                onClick={() => router.push(`/projects/${projectId}/rfis`)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[10px] font-bold transition-all shadow-[0_0_8px_rgba(245,158,11,0.2)] animate-pulse cursor-pointer"
                title="Click to view Overdue RFIs"
              >
                <FileQuestion className="h-3 w-3 text-amber-400" />
                <span>{overdueRfiCount} OVERDUE RFI{overdueRfiCount > 1 ? "S" : ""}</span>
              </button>
            )}
            {expiringBgCount > 0 && (
              <button
                onClick={() => router.push(`/projects/${projectId}/guarantees`)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[10px] font-bold transition-all shadow-[0_0_8px_rgba(244,63,94,0.2)] cursor-pointer"
                title="Click to view Expiring Guarantees"
              >
                <ShieldAlert className="h-3 w-3 text-rose-400" />
                <span>{expiringBgCount} GUARANTEE{expiringBgCount > 1 ? "S" : ""} EXPIRING</span>
              </button>
            )}
          </div>
        )}

        {/* Right: Live Telemetry & Shortcuts */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* True Fullscreen Toggle Button */}
          <button
            onClick={toggleFullscreen}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-all font-bold",
              isFullscreen
                ? "bg-primary/20 text-primary border-primary/60 shadow-[0_0_8px_rgba(0,255,102,0.2)]"
                : "border-border bg-muted/60 hover:border-primary/50 hover:text-foreground"
            )}
            title={isFullscreen ? "Exit Full Screen" : "Enter True Full Screen (Hide Firefox Browser UI)"}
          >
            {isFullscreen ? <Minimize2 className="h-3 w-3 text-primary" /> : <Maximize2 className="h-3 w-3 text-primary" />}
            <span>{isFullscreen ? "WINDOW" : "FULLSCREEN"}</span>
          </button>

          {/* Atmosphere & Sound Center Dialog Button */}
          <button
            onClick={() => setFxDialogOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary transition-all text-[10px] font-bold shadow-[0_0_8px_rgba(0,255,102,0.15)]"
            title="Open Atmospheric Shaders, Droplet & Sound Controller"
          >
            <Sparkles className="h-3 w-3" />
            <span>ATMOSPHERE FX</span>
          </button>

          {/* Quick Audio Mute Toggle */}
          <button
            onClick={() => fx.setSoundEnabled(!fx.soundEnabled)}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-colors",
              fx.soundEnabled
                ? "bg-primary/20 text-primary border-primary/50"
                : "bg-muted/60 text-muted-foreground border-border hover:text-foreground"
            )}
            title="Toggle Cyber Audio (Mechanical clicks & thunder)"
          >
            {fx.soundEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
            AUDIO: {fx.soundEnabled ? `${Math.round(fx.soundVolume * 100)}%` : "OFF"}
          </button>

          {/* Cmd+K trigger hint */}
          <button
            onClick={() => {
              const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
              window.dispatchEvent(ev);
            }}
            className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-muted/60 hover:border-primary/50 hover:text-primary transition-colors cursor-pointer text-[10px]"
            title="Open Command Palette"
          >
            <Terminal className="h-3 w-3 text-primary" />
            <span className="font-bold">Cmd+K</span>
          </button>

          {/* Nepali Calendar Date Widget */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-semibold transition-all cursor-pointer",
                  "border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary"
                )}
                title="Bikram Sambat Nepali Calendar (Click to open calendar)"
              >
                <CalendarIcon className="h-3 w-3 text-primary" />
                <span className="font-bold">
                  {calendarType === "BS" ? bsDate.displayNp : calendarType === "DUAL" ? `${bsDate.displayNp} (${bsDate.adDate.toISOString().slice(0, 10)})` : bsDate.adDate.toISOString().slice(0, 10)}
                </span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-primary/20 text-primary font-mono font-bold">
                  {calendarType === "AD" ? "AD" : "BS"}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-none shadow-2xl z-50" align="end">
              <div className="flex flex-col">
                <div className="px-3 py-2 bg-card border-b border-border flex items-center justify-between text-xs">
                  <span className="font-bold text-foreground">नेपाली क्यालेन्डर (Bikram Sambat)</span>
                  <div className="flex items-center gap-1 text-[10px]">
                    <button
                      onClick={() => setPref("calendarType", "BS")}
                      className={cn(
                        "px-1.5 py-0.5 rounded font-semibold",
                        calendarType === "BS" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      BS
                    </button>
                    <button
                      onClick={() => setPref("calendarType", "DUAL")}
                      className={cn(
                        "px-1.5 py-0.5 rounded font-semibold",
                        calendarType === "DUAL" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      DUAL
                    </button>
                    <button
                      onClick={() => setPref("calendarType", "AD")}
                      className={cn(
                        "px-1.5 py-0.5 rounded font-semibold",
                        calendarType === "AD" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      AD
                    </button>
                  </div>
                </div>
                <NepaliCalendar
                  value={new Date()}
                  showDualAdDate={true}
                  useDevanagari={true}
                />
              </div>
            </PopoverContent>
          </Popover>

          {/* Status LED & Clock */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_#00ff66]" />
              LIVE
            </span>
            <span className="text-foreground font-bold">{timeStr}</span>
          </div>
        </div>
      </div>

      <AtmosphericControllerDialog
        open={fxDialogOpen}
        onOpenChange={setFxDialogOpen}
      />
    </>
  );
}
