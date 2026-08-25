"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  HardHat, LayoutDashboard, FolderKanban, ClipboardList, Truck, ReceiptText,
  Users, ChevronLeft, History, Compass, FileSignature, ListChecks, LogOut,
  Sun, Moon, Monitor, Terminal, Sparkles, Anchor, Scan, Gauge, MessageSquare,
  RefreshCw, ShieldCheck, ShieldAlert, Building2, Database, Calendar,
  AlignLeft, AlignRight, Settings, EyeOff, BookOpen, Boxes, CloudRain, Zap, Wind, Droplets,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { fetchWithAuth, clearAuth, getToken } from "@/lib/client-auth";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { useFXStore } from "@/lib/fx-store";
import { AtmosphericControllerDialog } from "@/components/fx/atmospheric-controller-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

export type DockPosition = "bottom" | "left" | "right" | "top";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const TOP_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Finance & Accounts", href: "/finance", icon: ReceiptText },
  { label: "Team", href: "/team", icon: Users },
  { label: "Rate Catalogs", href: "/rate-catalogs", icon: Database },
  { label: "Presets", href: "/presets", icon: ClipboardList },
  { label: "Activity", href: "/activity", icon: History },
  { label: "Sync", href: "/sync", icon: RefreshCw },
];

const PROJECT_MODULES: NavItem[] = [
  { label: "Overview", href: "", icon: LayoutDashboard },
  { label: "Planning", href: "/boq", icon: Gauge },
  { label: "Workflow", href: "/workflow/rfi", icon: ListChecks },
  { label: "Communication", href: "/communication", icon: MessageSquare },
  { label: "Documents", href: "/drawings", icon: Compass },
  { label: "Quality & Safety", href: "/quality", icon: ShieldCheck },
  { label: "Variation Orders", href: "/variations", icon: FileSignature },
  { label: "Resources", href: "/materials", icon: Boxes },
];

const PROJECT_ADMIN_MODULES: NavItem[] = [
  { label: "Resource & Rate Library", href: "/rate-library", icon: BookOpen },
];

function useProjectIdFromPath(): string | null {
  const pathname = usePathname();
  const m = pathname?.match(/^\/projects\/([^/]+)/);
  return m?.[1] ?? null;
}

function DockIcon({
  item, active, position, mousePos, iconRef, onNavigate, tooltipSide,
}: {
  item: NavItem; active: boolean; position: DockPosition; mousePos: number | null;
  iconRef: (el: HTMLDivElement | null) => void; onNavigate?: () => void;
  tooltipSide: "top" | "bottom" | "left" | "right";
}) {
  const Icon = item.icon;
  const divRef = useRef<HTMLDivElement | null>(null);
  const [center, setCenter] = useState(0);
  const isHorizontal = position === "top" || position === "bottom";

  const setRef = useCallback((el: HTMLDivElement | null) => {
    divRef.current = el;
    iconRef(el);
  }, [iconRef]);

  useEffect(() => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setCenter(isHorizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2);
  });

  const MAX_DIST = 90;
  const MAX_SCALE = 1.7;
  const scale = mousePos !== null && Math.abs(mousePos - center) < MAX_DIST
    ? 1 + (MAX_SCALE - 1) * (1 - Math.abs(mousePos - center) / MAX_DIST)
    : 1;

  const transformOrigin =
    position === "top" ? "top center" :
    position === "bottom" ? "bottom center" :
    position === "left" ? "center left" : "center right";

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={setRef}
            style={{ scale, transformOrigin, transition: "scale 0.15s cubic-bezier(0.34,1.56,0.64,1)" }}
          >
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "relative flex h-11 w-11 items-center justify-center rounded transition-all duration-150 group",
                active ? "bg-primary/20 text-primary border border-primary/60 shadow-[0_0_12px_rgba(0,255,102,0.25)]" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:border hover:border-border/60"
              )}
            >
              <Icon className={cn("h-5 w-5 transition-transform", active ? "text-primary scale-110" : "group-hover:text-primary group-hover:scale-105")} />
              {active && (
                <span className={cn("absolute flex h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_#00ff66]",
                  position === "bottom" && "bottom-0.5 left-1/2 -translate-x-1/2",
                  position === "top" && "top-0.5 left-1/2 -translate-x-1/2",
                  position === "left" && "left-0.5 top-1/2 -translate-y-1/2",
                  position === "right" && "right-0.5 top-1/2 -translate-y-1/2"
                )} />
              )}
            </Link>
          </div>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} className="text-xs font-mono font-bold bg-card border border-border text-primary shadow-[0_0_10px_rgba(0,255,102,0.15)]">{item.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DockDivider({ position }: { position: DockPosition }) {
  const isHorizontal = position === "top" || position === "bottom";
  return <div className={cn("shrink-0 bg-white/20 rounded-full", isHorizontal ? "h-8 w-px mx-0.5" : "w-8 h-px my-0.5")} />;
}

export function AppDock({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { getPref, setPref } = useUserPreferences();
  const projectId = useProjectIdFromPath();
  const qc = useQueryClient();
  const fx = useFXStore();
  const [fxDialogOpen, setFxDialogOpen] = useState(false);

  const position = getPref<DockPosition>("dockPosition", "bottom");
  const autoHide = getPref<boolean>("dockAutoHide", false);
  const [visible, setVisible] = useState(true);
  const [mousePos, setMousePos] = useState<number | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isHorizontal = position === "top" || position === "bottom";

  const { data: meData } = useQuery<{
    user: { id: string; name: string; email: string; role: string; isSuperAdmin?: boolean; organization?: { id: string; name: string; code: string } | null };
  }>({
    queryKey: ["me"],
    queryFn: async () => { const res = await fetchWithAuth("/api/auth/me"); if (!res.ok) throw new Error("not authed"); return res.json(); },
    enabled: !!getToken(),
  });

  const user = meData?.user;
  const initials = user ? user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() : "?";

  // Auto-hide logic
  useEffect(() => {
    if (!autoHide) { setVisible(true); return; }
    setVisible(false);
    const edgeSize = 24;
    function onMove(e: MouseEvent) {
      let near = false;
      if (position === "bottom") near = e.clientY > window.innerHeight - edgeSize;
      else if (position === "top") near = e.clientY < edgeSize;
      else if (position === "left") near = e.clientX < edgeSize;
      else if (position === "right") near = e.clientX > window.innerWidth - edgeSize;
      if (near) { clearTimeout(hideTimer.current); setVisible(true); }
      else if (!dockRef.current?.matches(":hover")) {
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setVisible(false), 1400);
      }
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [autoHide, position]);

  function onMouseMove(e: React.MouseEvent) { setMousePos(isHorizontal ? e.clientX : e.clientY); }
  function onMouseLeave() { setMousePos(null); }

  async function logout() {
    await fetchWithAuth("/api/auth/logout", { method: "POST" });
    clearAuth(); qc.clear();
    toast.success("Signed out");
    window.location.href = "/login";
  }

  const adminItem: NavItem | null =
    user?.isSuperAdmin || (user as any)?.sessionKind === "admin"
      ? { label: "Platform Admin", href: "/admin", icon: ShieldAlert }
      : null;

  const navItems: NavItem[] = projectId
    ? [
        ...PROJECT_MODULES.map((item) => ({
          ...item,
          href: item.href === "" ? `/projects/${projectId}` : `/projects/${projectId}${item.href}`,
        })),
        ...(adminItem ? [adminItem] : []),
      ]
    : [...TOP_NAV, ...(adminItem ? [adminItem] : [])];

  const adminItems: NavItem[] = projectId
    ? PROJECT_ADMIN_MODULES.map((item) => ({
        ...item,
        href: `/projects/${projectId}${item.href}`,
      }))
    : [];

  function isActive(item: NavItem) {
    if (projectId && item.href.startsWith("/projects/")) {
      const suffix = item.href.replace(`/projects/${projectId}`, "");
      if (suffix === "") return pathname === `/projects/${projectId}`;
      if (item.label === "Workflow") return pathname.startsWith(`/projects/${projectId}/workflow/`);
      return pathname.startsWith(item.href);
    }
    return pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
  }

  const tooltipSide: "top" | "bottom" | "left" | "right" =
    position === "bottom" ? "top" : position === "top" ? "bottom" :
    position === "left" ? "right" : "left";

  const slideClass =
    position === "bottom" ? "translate-y-[calc(100%+24px)]" :
    position === "top" ? "-translate-y-[calc(100%+24px)]" :
    position === "left" ? "-translate-x-[calc(100%+24px)]" : "translate-x-[calc(100%+24px)]";

  const positionClass =
    position === "bottom" ? "bottom-5 left-1/2 -translate-x-1/2" :
    position === "top" ? "top-5 left-1/2 -translate-x-1/2" :
    position === "left" ? "left-5 top-1/2 -translate-y-1/2" : "right-5 top-1/2 -translate-y-1/2";

  return (
    <>
      {projectId && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/projects" className={cn(
                "fixed z-50 flex h-8 w-8 items-center justify-center rounded",
                "bg-card border border-border text-primary shadow-[0_0_12px_rgba(0,255,102,0.15)]",
                "hover:bg-primary/15 hover:border-primary transition-all",
                position === "bottom" && "bottom-24 left-4",
                position === "top" && "top-24 left-4",
                position === "left" && "left-24 top-4",
                position === "right" && "right-24 top-4"
              )}>
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-mono text-xs">All Projects</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <div
        ref={dockRef}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className={cn(
          "fixed z-50 flex items-center gap-1 p-1.5",
          "bg-card border border-border",
          "shadow-[0_0_24px_rgba(0,255,102,0.18)]",
          "transition-all duration-300 ease-out",
          isHorizontal ? "flex-row rounded" : "flex-col rounded",
          positionClass,
          autoHide && !visible && slideClass,
          autoHide && !visible && "opacity-0 pointer-events-none"
        )}
      >
        {/* Logo */}
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-primary/20 text-primary border border-primary shadow-[0_0_14px_#00ff66]">
          <HardHat className="h-5 w-5 text-primary" />
        </div>

        <DockDivider position={position} />

        {navItems.map((item) => (
          <DockIcon
            key={item.href + item.label}
            item={item}
            active={isActive(item)}
            position={position}
            mousePos={mousePos}
            iconRef={() => {}}
            onNavigate={onNavigate}
            tooltipSide={tooltipSide}
          />
        ))}

        {/* Admin group — Materials & Rate Library (project context only) */}
        {adminItems.length > 0 && (
          <>
            <DockDivider position={position} />
            {adminItems.map((item) => (
              <DockIcon
                key={item.href + item.label}
                item={item}
                active={isActive(item)}
                position={position}
                mousePos={mousePos}
                iconRef={() => {}}
                onNavigate={onNavigate}
                tooltipSide={tooltipSide}
              />
            ))}
          </>
        )}

        <DockDivider position={position} />

        {/* Settings */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-12 w-12 items-center justify-center rounded-2xl hover:bg-white/10 transition-colors group">
              <Settings className="h-5 w-5 text-white/60 group-hover:text-white transition-colors" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={tooltipSide} align="center" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">Dock Position</DropdownMenuLabel>
            {(["bottom", "top", "left", "right"] as DockPosition[]).map((pos) => {
              const icons: Record<DockPosition, React.ReactNode> = {
                bottom: <span className="text-base">⬇</span>,
                top: <span className="text-base">⬆</span>,
                left: <span className="text-base">⬅</span>,
                right: <span className="text-base">➡</span>,
              };
              return (
                <DropdownMenuItem
                  key={pos}
                  onClick={() => setPref("dockPosition", pos)}
                  className={cn("gap-2 capitalize", position === pos && "bg-accent font-semibold")}
                >
                  {icons[pos]} {pos}
                  {position === pos && <span className="ml-auto text-primary text-xs">✓</span>}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider font-mono">Calendar System</DropdownMenuLabel>
            {[
              { id: "BS", label: "Nepali (Bikram Sambat)", sub: "Default" },
              { id: "DUAL", label: "Dual (BS + AD)", sub: "Dual" },
              { id: "AD", label: "Gregorian (AD)", sub: "AD" },
            ].map((cal) => {
              const currentCal = getPref<string>("calendarType", "BS");
              const isSelected = currentCal === cal.id;
              return (
                <DropdownMenuItem
                  key={cal.id}
                  onClick={() => setPref("calendarType", cal.id)}
                  className={cn("gap-2 text-xs", isSelected && "bg-accent font-semibold text-primary")}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{cal.label}</span>
                  {isSelected && <span className="ml-auto text-primary text-xs font-bold">✓</span>}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-primary font-mono uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Atmospheric FX</span>
              <button
                onClick={() => setFxDialogOpen(true)}
                className="text-[10px] text-primary hover:underline font-bold"
              >
                OPEN SLIDERS ↗
              </button>
            </DropdownMenuLabel>
            
            <DropdownMenuItem onClick={() => fx.setMatrixRain(!fx.matrixRainEnabled)} className="gap-2 font-mono text-xs">
              <Terminal className="h-4 w-4 text-emerald-400" />
              Matrix Stream
              <span className={cn("ml-auto text-[10px] font-bold rounded px-1.5 py-0.5",
                fx.matrixRainEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {fx.matrixRainEnabled ? "ON" : "OFF"}
              </span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => fx.setWaterDroplets(!fx.waterDropletsEnabled)} className="gap-2 font-mono text-xs">
              <CloudRain className="h-4 w-4 text-emerald-400" />
              Glass Droplets ({fx.dropletCount})
              <span className={cn("ml-auto text-[10px] font-bold rounded px-1.5 py-0.5",
                fx.waterDropletsEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {fx.waterDropletsEnabled ? "ON" : "OFF"}
              </span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => fx.setStormWind(!fx.stormWindEnabled)} className="gap-2 font-mono text-xs">
              <Wind className="h-4 w-4 text-emerald-400" />
              Storm Wind Streaks
              <span className={cn("ml-auto text-[10px] font-bold rounded px-1.5 py-0.5",
                fx.stormWindEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {fx.stormWindEnabled ? "ON" : "OFF"}
              </span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => fx.setLightning(!fx.lightningEnabled)} className="gap-2 font-mono text-xs">
              <Zap className="h-4 w-4 text-emerald-400" />
              Lightning Simulator
              <span className={cn("ml-auto text-[10px] font-bold rounded px-1.5 py-0.5",
                fx.lightningEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {fx.lightningEnabled ? "ON" : "OFF"}
              </span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => setFxDialogOpen(true)} className="gap-2 font-mono text-xs text-primary font-bold bg-primary/10 hover:bg-primary/20">
              <Sparkles className="h-4 w-4" />
              FX SLIDERS & AUDIO CONTROLS…
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider font-mono flex items-center justify-between">
              <span>Glass Transparency</span>
              <span className="text-primary font-bold">{Math.round(fx.panelOpacity * 100)}%</span>
            </DropdownMenuLabel>
            <div className="px-2 py-1">
              <input
                type="range"
                min="30"
                max="100"
                step="1"
                value={Math.round(fx.panelOpacity * 100)}
                onChange={(e) => fx.setPanelOpacity(Number(e.target.value) / 100)}
                className="w-full h-1.5 bg-muted-foreground/30 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider font-mono">Behavior</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setPref("dockAutoHide", !autoHide)} className="gap-2 font-mono text-xs">
              <EyeOff className="h-4 w-4" />
              Auto-hide
              <span className={cn("ml-auto text-[10px] font-bold rounded px-1.5 py-0.5",
                autoHide ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {autoHide ? "ON" : "OFF"}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-12 w-12 items-center justify-center rounded-2xl hover:bg-white/10 transition-colors" title={user?.name}>
              <Avatar className="h-8 w-8 ring-2 ring-white/20">
                <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-700 text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={tooltipSide} align="center" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="font-semibold">{user?.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(user?.isSuperAdmin || (user as any)?.sessionKind === "admin") && (
              <>
                <DropdownMenuSeparator />
                <Link href="/admin">
                  <DropdownMenuItem className="gap-2 text-amber-400 focus:text-amber-300 font-semibold cursor-pointer">
                    <ShieldAlert className="h-4 w-4" /> Platform Admin Console
                  </DropdownMenuItem>
                </Link>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive cursor-pointer" onClick={logout}>
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AtmosphericControllerDialog
        open={fxDialogOpen}
        onOpenChange={setFxDialogOpen}
      />
    </>
  );
}
