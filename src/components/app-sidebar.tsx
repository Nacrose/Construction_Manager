"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HardHat, ChevronLeft, LogOut, Settings, ShieldAlert, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWithAuth, clearAuth, getToken } from "@/lib/client-auth";
import {
  GLOBAL_NAV,
  PROJECT_MODULE_NAV,
  type SidebarNavItem as NavItem,
} from "@/lib/nav-registry";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Nav data (GLOBAL_NAV / PROJECT_MODULE_NAV) lives in the nav registry —
// single source of truth shared with ModuleTabs. This component owns only
// the rendering.

export function AppSidebar() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const projectId = React.useMemo(() => {
    const m = pathname?.match(/^\/projects\/([^/]+)/);
    return m?.[1] ?? null;
  }, [pathname]);

  const { data: user } = useQuery({
    queryKey: ["auth-me-sidebar"],
    queryFn: async () => {
      if (!getToken()) return null;
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

  const isGlobalActive = (item: NavItem) => {
    if (projectId) return false;
    if (item.href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(item.href);
  };

  const isProjectModuleActive = (item: NavItem) => {
    if (!projectId) return false;
    const base = `/projects/${projectId}`;
    if (item.href === "") {
      return pathname === base || pathname === `${base}/dashboard`;
    }
    return pathname.startsWith(`${base}${item.href}`);
  };

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-[#c7d8e8] flex flex-col h-full select-none z-30 shadow-xs transition-all">
      {/* Brand Header */}
      <div className="h-14 px-4 border-b border-[#e2edf7] bg-[#f8fbfe] flex items-center justify-between shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-b from-[#f59e0b] to-[#d97706] text-white shadow-xs border border-amber-600">
            <HardHat className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-extrabold tracking-wider text-slate-900 uppercase font-sans">
              CONTRACTOR
            </span>
            <span className="text-[10px] font-semibold text-[#0284c7] font-mono leading-none">
              ENTERPRISE ERP
            </span>
          </div>
        </Link>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#e5eef7] text-[#0369a1] border border-[#c7d8e8]">
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
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-[#0284c7] transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>All Projects</span>
              </Link>
              <div className="mt-1 px-2.5 py-1.5 rounded-lg bg-[#e5eef7] border border-[#c7d8e8] text-xs font-bold text-slate-800 truncate">
                Project Workspace
              </div>
            </div>

            <div className="pt-1 space-y-0.5">
              <span className="px-2 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600">
                Project Modules
              </span>
              {PROJECT_MODULE_NAV.map((item) => {
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
                        ? "bg-[#e5eef7] text-[#0284c7] border border-[#c7d8e8] font-bold shadow-xs"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#0284c7]" : "text-slate-600")} />
                    <span className="truncate flex-1">{item.label}</span>
                    {active && <ChevronRight className="h-3.5 w-3.5 text-[#0284c7] shrink-0" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Global Enterprise Modules */}
        <div className="space-y-0.5">
          <span className="px-2 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600">
            Enterprise Hub
          </span>
          {GLOBAL_NAV.map((item) => {
            const Icon = item.icon;
            const active = isGlobalActive(item);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
                  active
                    ? "bg-[#e5eef7] text-[#0284c7] border border-[#c7d8e8] font-bold shadow-xs"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#0284c7]" : "text-slate-600")} />
                <span className="truncate flex-1">{item.label}</span>
                {active && <ChevronRight className="h-3.5 w-3.5 text-[#0284c7] shrink-0" />}
              </Link>
            );
          })}
        </div>

        {/* Preferences / System */}
        <div className="space-y-0.5 pt-2 border-t border-[#e2edf7]">
          <span className="px-2 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600">
            System
          </span>
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
              pathname === "/settings"
                ? "bg-[#e5eef7] text-[#0284c7] border border-[#c7d8e8] font-bold shadow-xs"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
            )}
          >
            <Settings className={cn("h-4 w-4 shrink-0", pathname === "/settings" ? "text-[#0284c7]" : "text-slate-600")} />
            <span className="truncate flex-1">Settings</span>
          </Link>
        </div>
      </div>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-[#e2edf7] bg-[#f8fbfe]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-2.5 p-2 rounded-xl border border-[#c7d8e8] bg-white hover:bg-slate-50 text-left transition-colors shadow-2xs"
            >
              <Avatar className="h-7 w-7 ring-1 ring-[#0284c7]/40 shrink-0">
                <AvatarFallback className="bg-gradient-to-br from-[#0284c7] to-[#0369a1] text-white text-[10px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {user?.name || "Contractor User"}
                </p>
                <p className="text-[10px] text-slate-500 truncate font-mono">
                  {user?.email || "contractor@os.com"}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56 bg-white border border-[#c7d8e8] text-slate-900 shadow-xl rounded-xl">
            <DropdownMenuLabel className="flex flex-col">
              <span className="font-semibold text-xs">{user?.name || "Contractor User"}</span>
              <span className="text-[10px] font-mono text-slate-500 font-normal">{user?.email || "contractor@os.com"}</span>
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
