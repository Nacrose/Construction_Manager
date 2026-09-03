"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HardHat, ChevronLeft, LogOut,
  Settings, ShieldAlert, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWithAuth, clearAuth } from "@/lib/client-auth";
import { trpc } from "@/lib/trpc-client";
import { capabilitiesSchema, type OperatingCapabilities } from "@/lib/capabilities";
import {
  GLOBAL_NAV,
  PROJECT_MODULE_NAV,
  filterNavByCapabilities,
  type SidebarNavItem,
} from "@/lib/nav-registry";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GLOBAL_NAV_ITEMS = GLOBAL_NAV; // extractive migration: data lives in the registry
const PROJECT_NAV_ITEMS = PROJECT_MODULE_NAV;

export function AppSidebar() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  // Resolved capability map (ADR-0004): nav is a PROJECTION of it, never
  // the guard — the same tRPC query the team page and ModuleTabs use, so
  // react-query serves all three from one request. Fail-open while loading
  // or unparsable; server-side capabilityGuard owns the real enforcement.
  const { data: orgProfile } = trpc.project.getOrgProfile.useQuery(undefined, {
    staleTime: 300_000,
  });
  const orgCapabilities = React.useMemo<OperatingCapabilities | null>(() => {
    const parsed = capabilitiesSchema.safeParse(orgProfile?.org?.capabilities);
    return parsed.success ? parsed.data : null;
  }, [orgProfile]);
  const globalNav = filterNavByCapabilities(GLOBAL_NAV_ITEMS, orgCapabilities);
  const projectNav = filterNavByCapabilities(PROJECT_NAV_ITEMS, orgCapabilities);

  const projectId = React.useMemo(() => {
    const m = pathname?.match(/^\/projects\/([^/]+)/);
    return m?.[1] ?? null;
  }, [pathname]);

  const { data: user } = useQuery({
    queryKey: ["auth-me-sidebar"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/auth/me");
      if (!res.ok) return null;
      const json = await res.json();
      return json.user ?? json;
    },
    staleTime: 5 * 60 * 1000,
  });

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Best-effort
    }
    clearAuth();
    queryClient.clear();
    window.location.href = "/login";
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((p: string) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "CU";

  const isGlobalActive = (item: SidebarNavItem) => {
    if (projectId) return false;
    if (item.href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(item.href);
  };

  const isProjectModuleActive = (item: SidebarNavItem) => {
    if (!projectId) return false;
    const base = `/projects/${projectId}`;
    if (item.href === "") {
      return pathname === base || pathname === `${base}/dashboard`;
    }
    return pathname.startsWith(`${base}${item.href}`);
  };

  return (
    <aside className="w-64 shrink-0 bg-card border-r border-[var(--border)] flex flex-col h-full select-none z-30 shadow-xs transition-all">
      {/* Brand Header */}
      <div className="title-block h-14 px-4 bg-card/70 flex items-center justify-between shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-[6px] amber-gradient text-white shadow-[0_2px_8px_rgba(245,158,11,0.35)] border border-amber/70">
            <HardHat className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-extrabold tracking-wider text-foreground uppercase font-sans">
              CONTRACTOR
            </span>
            <span className="text-[10px] font-semibold text-[var(--primary)] font-mono leading-none">
              ENTERPRISE ERP
            </span>
          </div>
        </Link>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[var(--background)] text-[var(--primary)] border border-[var(--border)]">
          v2.0
        </span>
      </div>

      {/* Navigation Links Area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* If inside Project Context, show Project Navigation Rail */}
        {projectId ? (
          <div className="space-y-1">
            <div className="px-2 pb-2">
              <Link
                href="/projects"
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-[var(--primary)] transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>All Projects</span>
              </Link>
              <div className="mt-1 px-2.5 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs font-bold text-foreground/90 truncate">
                Project Workspace
              </div>
            </div>

            <div className="pt-1 space-y-0.5">
              <span className="px-2 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                Project Modules
              </span>
              {projectNav.map((item) => {
                const Icon = item.icon;
                const active = isProjectModuleActive(item);
                const targetUrl = `/projects/${projectId}${item.href}`;
                return (
                  <Link
                    key={item.label}
                    href={targetUrl}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
                      active
                        ? "bg-[var(--background)] text-[var(--primary)] border border-[var(--border)] font-bold shadow-xs"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[var(--primary)]" : "text-muted-foreground")} />
                    <span className="truncate flex-1">{item.label}</span>
                    {active && <ChevronRight className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Global Enterprise Modules */}
        <div className="space-y-0.5">
          <span className="px-2 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
            Enterprise Hub
          </span>
          {globalNav.map((item) => {
            const Icon = item.icon;
            const active = isGlobalActive(item);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
                  active
                    ? "bg-[var(--background)] text-[var(--primary)] border border-[var(--border)] font-bold shadow-xs"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[var(--primary)]" : "text-muted-foreground")} />
                <span className="truncate flex-1">{item.label}</span>
                {active && <ChevronRight className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />}
              </Link>
            );
          })}
        </div>

        {/* Preferences / System */}
        <div className="space-y-0.5 pt-2 border-t border-[var(--input)]">
          <span className="px-2 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
            System
          </span>
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
              pathname === "/settings"
                ? "bg-[var(--background)] text-[var(--primary)] border border-[var(--border)] font-bold shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent"
            )}
          >
            <Settings className={cn("h-4 w-4 shrink-0", pathname === "/settings" ? "text-[var(--primary)]" : "text-muted-foreground")} />
            <span className="truncate flex-1">Settings</span>
          </Link>
        </div>
      </div>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-[var(--input)] bg-[#f8fbfe]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-2.5 p-2 rounded-xl border border-[var(--border)] bg-card hover:bg-muted/60 text-left transition-colors shadow-2xs"
            >
              <Avatar className="h-7 w-7 ring-1 ring-[var(--primary)]/40 shrink-0">
                <AvatarFallback className="bg-gradient-to-br from-[var(--primary)] to-[var(--primary)] text-white text-[10px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">
                  {user?.name || "Contractor User"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate font-mono">
                  {user?.email || "contractor@os.com"}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56 bg-card border border-[var(--border)] text-foreground shadow-xl rounded-xl">
            <DropdownMenuLabel className="flex flex-col">
              <span className="font-semibold text-xs">{user?.name || "Contractor User"}</span>
              <span className="text-[10px] font-mono text-muted-foreground font-normal">{user?.email || "contractor@os.com"}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(user?.isSuperAdmin || (user as any)?.sessionKind === "admin") && (
              <>
                <Link href="/admin">
                  <DropdownMenuItem className="gap-2 text-amber-600 focus:text-amber-700 font-semibold cursor-pointer text-xs">
                    <ShieldAlert className="h-3.5 w-3.5" /> Platform Admin
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              className="gap-2 text-rose-600 focus:text-rose-700 cursor-pointer text-xs font-semibold"
              onClick={logout}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
