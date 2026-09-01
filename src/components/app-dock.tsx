"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  HardHat, LayoutDashboard, FolderKanban, ClipboardList, ReceiptText,
  Users, ChevronLeft, History, Compass, FileSignature, ListChecks, LogOut,
  Settings, Database, Mail, RefreshCw, ShieldAlert, BookOpen, Boxes,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { fetchWithAuth, clearAuth, getToken } from "@/lib/client-auth";
import { useUserPreferences } from "@/components/user-preferences-provider";
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
  { label: "Drawings Vault", href: "/drawings", icon: Compass },
  { label: "Correspondence", href: "/correspondence", icon: Mail },
  { label: "Team & Workspace", href: "/team", icon: Users },
  { label: "Rate Catalogs", href: "/rate-catalogs", icon: Database },
  { label: "Presets", href: "/presets", icon: ClipboardList },
  { label: "Activity", href: "/activity", icon: History },
  { label: "Sync", href: "/sync", icon: RefreshCw },
];

const PROJECT_MODULES: NavItem[] = [
  { label: "Overview", href: "", icon: LayoutDashboard },
  { label: "Planning", href: "/boq", icon: ClipboardList },
  { label: "Workflow", href: "/workflow/rfi", icon: ListChecks },
  { label: "Communication", href: "/communication", icon: Mail },
  { label: "Documents", href: "/drawings", icon: Compass },
  { label: "Quality & Safety", href: "/quality", icon: HardHat },
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

  const MAX_DIST = 80;
  const MAX_SCALE = 1.35;
  const scale = mousePos !== null && Math.abs(mousePos - center) < MAX_DIST
    ? 1 + (MAX_SCALE - 1) * (1 - Math.abs(mousePos - center) / MAX_DIST)
    : 1;

  const transformOrigin =
    position === "top" ? "top center" :
    position === "bottom" ? "bottom center" :
    position === "left" ? "center left" : "center right";

  return (
    <TooltipProvider delayDuration={50}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={setRef}
            style={{ scale, transformOrigin, transition: "scale 0.15s cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "snappy-btn relative flex h-9 w-9 items-center justify-center rounded-lg select-none cursor-pointer group",
                active 
                  ? "rail-btn-active bg-white text-[#0369a1] border border-[#0284c7] shadow-sm font-bold" 
                  : "text-slate-600 hover:bg-white/80 hover:text-slate-950 hover:shadow-xs"
              )}
            >
              <Icon className={cn("h-4 w-4 transition-transform", active ? "text-[#0284c7] scale-110" : "group-hover:text-[#0284c7] group-hover:scale-105")} />
              {active && (
                <span className={cn("absolute flex h-1.5 w-1.5 rounded-full bg-[#0284c7] shadow-[0_0_4px_#0284c7]",
                  position === "bottom" && "bottom-0.5 left-1/2 -translate-x-1/2",
                  position === "top" && "top-0.5 left-1/2 -translate-x-1/2",
                  position === "left" && "left-0.5 top-1/2 -translate-y-1/2",
                  position === "right" && "right-0.5 top-1/2 -translate-y-1/2"
                )} />
              )}
            </Link>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side={tooltipSide}
          sideOffset={8}
          className="text-xs font-mono font-bold bg-slate-900 border border-slate-700 text-white shadow-xl px-2.5 py-1 rounded-md z-[100] animate-in fade-in zoom-in-95 duration-100"
        >
          {item.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DockDivider({ position }: { position: DockPosition }) {
  const isHorizontal = position === "top" || position === "bottom";
  return <div className={cn("shrink-0 bg-slate-300/80 rounded-full", isHorizontal ? "h-6 w-[1px] mx-0.5" : "w-6 h-[1px] my-0.5")} />;
}

export function AppDock({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { getPref } = useUserPreferences();
  const projectId = useProjectIdFromPath();
  const qc = useQueryClient();

  const position = getPref<DockPosition>("dockPosition", "left");
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
    enabled: !getToken(),
  });

  const user = meData?.user;
  const initials = user ? user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() : "CM";

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
    if (item.href === "/dashboard" && pathname === "/dashboard") return true;
    if (item.href !== "/dashboard" && pathname?.startsWith(item.href)) return true;
    return false;
  }

  const tooltipSide =
    position === "bottom" ? "top" :
    position === "top" ? "bottom" :
    position === "left" ? "right" : "left";

  const slideClass =
    position === "bottom" ? "translate-y-[calc(100%+24px)]" :
    position === "top" ? "-translate-y-[calc(100%+24px)]" :
    position === "left" ? "-translate-x-[calc(100%+24px)]" : "translate-x-[calc(100%+24px)]";

  const positionClass =
    position === "bottom" ? "bottom-3 left-1/2 -translate-x-1/2" :
    position === "top" ? "top-3 left-1/2 -translate-x-1/2" :
    position === "left" ? "left-3 top-1/2 -translate-y-1/2" : "right-3 top-1/2 -translate-y-1/2";

  return (
    <>
      {projectId && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/projects" className={cn(
                "fixed z-50 flex h-7 w-7 items-center justify-center rounded-md",
                "bg-white border border-[#bdd1e5] text-[#0284c7] shadow-sm",
                "hover:bg-[#e0f2fe] hover:border-[#0284c7] transition-all",
                position === "bottom" && "bottom-20 left-3",
                position === "top" && "top-20 left-3",
                position === "left" && "left-20 top-3",
                position === "right" && "right-20 top-3"
              )}>
                <ChevronLeft className="h-3.5 w-3.5" />
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
          "fixed z-50 flex items-center gap-1 p-1 sculpted-sidebar rounded-xl border border-[#bdd1e5] shadow-lg",
          "transition-all duration-200 ease-out",
          isHorizontal ? "flex-row" : "flex-col",
          positionClass,
          autoHide && !visible && slideClass,
          autoHide && !visible && "opacity-0 pointer-events-none"
        )}
      >
        {/* 3D Helmet Logo */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-[#f59e0b] to-[#d97706] text-white shadow-xs border border-amber-600">
          <HardHat className="h-4 w-4 text-white" />
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

        {/* Settings as a standard clean Tab */}
        <DockIcon
          item={{ label: "Settings", href: "/settings", icon: Settings }}
          active={pathname === "/settings"}
          position={position}
          mousePos={mousePos}
          iconRef={() => {}}
          onNavigate={onNavigate}
          tooltipSide={tooltipSide}
        />

        {/* User avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/80 transition-colors" title={user?.name}>
              <Avatar className="h-7 w-7 ring-1 ring-[#0284c7]/40">
                <AvatarFallback className="bg-gradient-to-br from-[#0284c7] to-[#0369a1] text-white text-[10px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={tooltipSide} align="center" className="w-56 bg-white border border-[#c7d8e8] text-slate-900 shadow-xl">
            <DropdownMenuLabel className="flex flex-col">
              <span className="font-semibold">{user?.name || "Contractor User"}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.email || "contractor@os.com"}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(user?.isSuperAdmin || (user as any)?.sessionKind === "admin") && (
              <>
                <DropdownMenuSeparator />
                <Link href="/admin">
                  <DropdownMenuItem className="gap-2 text-amber-600 focus:text-amber-700 font-semibold cursor-pointer">
                    <ShieldAlert className="h-4 w-4" /> Platform Admin Console
                  </DropdownMenuItem>
                </Link>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-rose-600 focus:text-rose-700 cursor-pointer" onClick={logout}>
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
