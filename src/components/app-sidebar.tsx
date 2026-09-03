"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, HardHat, LogOut, Settings, ShieldAlert, ChevronsUpDown, LayoutGrid, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWithAuth, clearAuth } from "@/lib/client-auth";
import { trpc } from "@/lib/trpc-client";
import { capabilitiesSchema, type OperatingCapabilities } from "@/lib/capabilities";
import { GLOBAL_NAV, PROJECT_MODULE_NAV, filterNavByCapabilities, type SidebarNavItem } from "@/lib/nav-registry";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NavigationContextMenu } from "@/components/navigation-context-menu";
import { SidebarClock } from "@/components/sidebar-clock";

/** Extract the module path after `/projects/[id]` so a project switch keeps
 *  the same place (gantt → gantt, boq → boq). Returns "" for the overview. */
function activeProjectModule(pathname: string): string {
  const m = pathname.match(/^\/projects\/([^/]+)(\/.*)?$/);
  return m?.[2] ?? "";
}

function groupNavigation(items: readonly SidebarNavItem[]) {
  return items.reduce<Array<{ label: string; items: SidebarNavItem[] }>>((groups, item) => {
    const label = item.group ?? "Workspace";
    const current = groups.find((group) => group.label === label);
    if (current) current.items.push(item);
    else groups.push({ label, items: [item] });
    return groups;
  }, []);
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = React.useMemo(() => pathname?.match(/^\/projects\/([^/]+)/)?.[1] ?? null, [pathname]);

  const { data: orgProfile } = trpc.project.getOrgProfile.useQuery(undefined, { staleTime: 300_000 });
  const capabilities = React.useMemo<OperatingCapabilities | null>(() => {
    const parsed = capabilitiesSchema.safeParse(orgProfile?.org?.capabilities);
    return parsed.success ? parsed.data : null;
  }, [orgProfile]);
  const { data: projectData } = trpc.project.get.useQuery({ id: projectId ?? "" }, { enabled: Boolean(projectId), staleTime: 300_000 });
  const { data: projectsData } = trpc.project.list.useQuery(undefined, { staleTime: 300_000 });
  const { data: user } = useQuery({
    queryKey: ["auth-me-sidebar"],
    queryFn: async () => {
      const response = await fetchWithAuth("/api/auth/me");
      if (!response.ok) return null;
      const json = await response.json();
      return json.user ?? json;
    },
    staleTime: 300_000,
  });

  const orgNav = filterNavByCapabilities(GLOBAL_NAV, capabilities);
  const projectNav = filterNavByCapabilities(PROJECT_MODULE_NAV, capabilities);
  const projectGroups = groupNavigation(projectNav);
  const projects = projectsData?.projects ?? [];
  const projectName = projectData?.project?.name ?? "Project workspace";
  const projectCode = projectData?.project?.code ?? "";
  const initials = user?.name ? user.name.split(" ").map((part: string) => part[0]).slice(0, 2).join("").toUpperCase() : "CU";

  const isActive = (item: SidebarNavItem, isProjectItem = false) => {
    if (isProjectItem && projectId) {
      const base = `/projects/${projectId}`;
      return item.href === "" ? pathname === base || pathname === `${base}/dashboard` : pathname.startsWith(`${base}${item.href}`);
    }
    // Organisation items are ABSOLUTE app paths — never project-prefixed.
    return item.href === "/dashboard" ? pathname === "/dashboard" || pathname === "/" : pathname.startsWith(item.href);
  };

  /** Switch to a project, landing on the SAME module we are in (id-agnostic). */
  const switchToProject = (nextId: string) => {
    if (nextId === projectId) return;
    const modulePath = activeProjectModule(pathname ?? "");
    router.push(nextId === projectId ? "/projects" : `/projects/${nextId}${modulePath}`);
  };

  const goToOrg = () => router.push("/projects");

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* Best effort. */ }
    clearAuth();
    queryClient.clear();
    window.location.href = "/login";
  };

  const renderNavLink = (item: SidebarNavItem, isProjectItem = false) => {
    // Organisation links are absolute app paths; project-module links are
    // relative to the current project base.
    const href = isProjectItem && projectId ? `/projects/${projectId}${item.href}` : item.href;
    const Icon = item.icon;
    const active = isActive(item, isProjectItem);
    return (
      <NavigationContextMenu key={item.href || "overview"} href={href} label={item.label}>
        <Link href={href} className={cn("group flex min-h-7 items-center gap-2 rounded-[4px] border px-2 text-[11px] font-medium transition-colors", active ? "rail-btn-active text-foreground" : "border-transparent text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground")}>
          <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {active && <ChevronRight className="h-3 w-3 shrink-0 text-primary" />}
        </Link>
      </NavigationContextMenu>
    );
  };

  return (
    <aside className="sculpted-sidebar w-[150px] shrink-0 flex flex-col h-full select-none z-30">
      <div className="title-block h-14 px-3 flex items-center shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] bg-primary text-primary-foreground shadow-[0_2px_0_#744127]"><HardHat className="h-4 w-4" /></span>
          <span className="min-w-0 leading-none"><span className="block text-[11px] font-bold tracking-[0.13em] text-foreground">CONTRACTOR</span><span className="block mt-1 text-[9px] font-mono uppercase tracking-[0.12em] text-muted-foreground">control desk</span></span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label={projectId ? "Organisation & project navigation" : "Organisation navigation"}>
        {/* Organisation section — always present */}
        <section className="mt-2 first:mt-0">
          <p className="px-2 pb-1 text-[9px] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground">Organisation</p>
          <div className="space-y-px">
            {orgNav.map((item) => renderNavLink(item))}
          </div>
        </section>

        {/* Current project section — only when inside a project */}
        {projectId && (
          <section className="mt-4">
            <p className="px-2 pb-1 text-[9px] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current Project</p>
            {projectGroups.map((group) => (
              <div key={group.label} className="mt-2">
                <p className="px-2 pb-1 text-[9px] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">{group.label}</p>
                <div className="space-y-px">
                  {group.items.map((item) => renderNavLink(item, true))}
                </div>
              </div>
            ))}
          </section>
        )}
      </nav>

      {/* Project switcher — below the Organisation & Current Project nav */}
      <div className="px-2 pb-1 shrink-0 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="w-full flex items-center gap-2 rounded-md border border-border bg-card/80 px-2 py-1.5 text-left shadow-xs hover:bg-card transition-colors">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-info/15 text-info"><LayoutGrid className="h-3.5 w-3.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">{projectId ? projectName : "Organisation desk"}</span>
                <span className="block truncate text-[9px] font-mono uppercase tracking-[0.11em] text-muted-foreground">{projectId ? (projectCode || "Project workspace") : "Across all projects"}</span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-64">
            <DropdownMenuLabel className="text-xs">Switch project</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-xs" onClick={goToOrg}>
              <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1">All projects</span>
              {!projectId && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {projects.length === 0 ? (
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground">No projects yet.</p>
            ) : (
              projects.map((p) => (
                <DropdownMenuItem key={p.id} className="gap-2 text-xs" onClick={() => switchToProject(p.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.name}</span>
                    {p.code && <span className="block truncate text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground">{p.code}</span>}
                  </span>
                  {projectId === p.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border-t border-sidebar-border p-2">
        <Link href="/settings" className={cn("flex h-7 items-center gap-2 rounded-[4px] px-2 text-[11px] font-medium text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground", pathname === "/settings" && "bg-card text-foreground")}><Settings className="h-3.5 w-3.5" /> Settings</Link>
        <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="mt-1 flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-sidebar-accent/70"><Avatar className="h-6 w-6 shrink-0"><AvatarFallback className="bg-primary text-[9px] font-bold text-primary-foreground">{initials}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-foreground">{user?.name || "Contractor user"}</span><span className="block truncate text-[9px] text-muted-foreground">{user?.email || ""}</span></span></button></DropdownMenuTrigger><DropdownMenuContent side="right" align="end" className="w-56"><DropdownMenuLabel className="text-xs">{user?.name || "Contractor user"}</DropdownMenuLabel><DropdownMenuSeparator />{(user?.isSuperAdmin || (user as { sessionKind?: string } | null)?.sessionKind === "admin") && <><Link href="/admin"><DropdownMenuItem className="gap-2 text-xs"><ShieldAlert className="h-3.5 w-3.5" />Platform admin</DropdownMenuItem></Link><DropdownMenuSeparator /></>}<DropdownMenuItem className="gap-2 text-xs text-destructive" onClick={logout}><LogOut className="h-3.5 w-3.5" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
      <SidebarClock />
    </aside>
  );
}
