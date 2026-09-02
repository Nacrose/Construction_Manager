"use client";

import { trpc } from "@/lib/trpc-client";
import { use } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamManager } from "@/components/team-manager";
import {
  FileQuestion,
  ClipboardList,
  GanttChartSquare,
  Boxes,
  Wrench,
  FolderArchive,
  ReceiptText,
  Users,
  Calendar,
  Banknote,
  MapPin,
  Building2,
  FileSignature,
  ListChecks,
  Factory,
  BarChart3,
  Clock,
  Send,
  Mail,
  Settings,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { isModuleEnabled, parseEnabledModules } from "@/lib/project-modules";
import { ProjectModulesTab } from "@/components/project-modules-tab";

type _ProjectDetail = {
  project: {
    id: string;
    name: string;
    code: string;
    client: string | null;
    location: string | null;
    contractValue: number | null;
    startDate: string | null;
    endDate: string | null;
    status: string;
    description: string | null;
    createdAt: string;
    members: Array<{
      id: string;
      role: string;
      user: { id: string; name: string; email: string; role: string };
    }>;
  };
  myRole: string;
};

import { AnimatedPage } from "@/components/ui/animated-page";
import { CostSummaryCard } from "@/components/costs/cost-summary-card";
import { CostRatesCard } from "@/components/costs/cost-rates-card";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data, isLoading, error } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  const { data: submittedRfis } = trpc.workflow.rfi.list.useQuery(
    { projectId: id, status: "submitted", limit: 500 },
    { enabled: data?.myRole === "project_manager" || data?.myRole === "coordinator" },
  );

  if (isLoading) {
    return (
      <AnimatedPage className="space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </AnimatedPage>
    );
  }

  if (error || !data) {
    return (
      <AnimatedPage className="p-12 text-center">
        <p className="text-destructive">
          {error?.message ?? "Project not found."}
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-block text-sm text-emerald-600 hover:underline"
        >
          Back to projects
        </Link>
      </AnimatedPage>
    );
  }

  const { project } = data;

  return (
    <AnimatedPage className="space-y-8 pb-8">
      {/* Premium Gradient Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--navy-mid)] via-slate-800 to-[var(--navy-mid)] p-8 text-white shadow-xl dark:from-[var(--navy-deep)] dark:via-slate-900 dark:to-[var(--navy-deep)]">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
            <Link href="/projects" className="hover:text-white transition-colors">
              Projects
            </Link>
            <span className="opacity-50">/</span>
            <span className="font-mono bg-white/10 px-2 py-0.5 rounded-md text-emerald-300">{project.code}</span>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white shadow-sm">
                {project.name}
              </h1>
              {project.description && (
                <p className="mt-2 max-w-2xl text-muted-foreground text-lg">
                  {project.description}
                </p>
              )}
            </div>
            <Badge variant="outline" className={`capitalize shrink-0 bg-white/10 text-white border-white/20 backdrop-blur-md`}>
              {project.status.replace("_", " ")}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={Building2}
          label="Client"
          value={project.client ?? "—"}
        />
        <InfoCard
          icon={MapPin}
          label="Location"
          value={project.location ?? "—"}
        />
        <InfoCard
          icon={Banknote}
          label="Contract value"
          value={
            project.contractValue
              ? `NPR ${project.contractValue.toLocaleString()}`
              : "—"
          }
        />
        <InfoCard
          icon={Calendar}
          label="Duration"
          value={
            project.startDate && project.endDate
              ? `${format(new Date(project.startDate), "MMM yyyy")} → ${format(
                  new Date(project.endDate),
                  "MMM yyyy"
                )}`
              : "—"
          }
        />
      </div>

      {submittedRfis && submittedRfis.rfis.length > 0 && (
        <Link href={`/projects/${id}/workflow/rfi?status=submitted`}>
          <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  {submittedRfis.rfis.length} RFI{submittedRfis.rfis.length > 1 ? "s" : ""} awaiting your response
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  {submittedRfis.rfis.length > 3
                    ? `Latest: ${submittedRfis.rfis.slice(0, 3).map(r => r.number).join(", ")}…`
                    : submittedRfis.rfis.map(r => r.number).join(", ")}
                </p>
              </div>
              <Send className="h-4 w-4 text-amber-500 shrink-0" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Cost Summary — auto-captured + manual expenses */}
      <CostSummaryCard
        projectId={id}
        canWrite={!!(data?.myRole && data.myRole !== "client" && data.myRole !== "inspector")}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>
              Jump into a module for this project.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {/* Core — always visible */}
            <ModuleLink
              href={`/projects/${id}/dashboard`}
              icon={BarChart3}
              label="Dashboard"
              desc="Costs, progress & activity feed"
            />
            <ModuleLink
              href={`/projects/${id}/boq`}
              icon={ClipboardList}
              label="BOQ"
              desc="Bill of Quantities & rate analysis"
            />
            {/* Module-gated links */}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "gantt") && (
              <ModuleLink
                href={`/projects/${id}/boq?tab=schedule`}
                icon={GanttChartSquare}
                label="Schedule"
                desc="Gantt chart & dependencies"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "guarantees") && (
              <ModuleLink
                href={`/projects/${id}/guarantees`}
                icon={ShieldCheck}
                label="Bank Guarantees & Insurance"
                desc="Performance Bonds, APGs & CAR Policies"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "variations") && (
              <ModuleLink
                href={`/projects/${id}/variations`}
                icon={FileSignature}
                label="Variation Orders"
                desc="Contract changes & extras"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "accounting") && (
              <ModuleLink
                href={`/projects/${id}/accounting`}
                icon={BookOpen}
                label="Accounting & Day Book"
                desc="Tally Day Book & Ledger Statements"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "materials") && (
              <ModuleLink
                href={`/projects/${id}/materials`}
                icon={Boxes}
                label="Materials & Inventory"
                desc="Material catalog, GRN & stock"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "subcontractors") && (
              <ModuleLink
                href={`/projects/${id}/subcontractors`}
                icon={ListChecks}
                label="Subcontractors"
                desc="Subcontractor billing & retention"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "ipc") && (
              <ModuleLink
                href={`/projects/${id}/ipc`}
                icon={ReceiptText}
                label="IPC Certificates"
                desc="Interim Payment Certificates"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "hr") && (
              <ModuleLink
                href={`/projects/${id}/hr`}
                icon={Users}
                label="HR & Payroll"
                desc="Staff, muster roll & wages"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "equipment") && (
              <ModuleLink
                href={`/projects/${id}/equipment`}
                icon={Wrench}
                label="Equipment"
                desc="Equipment logs & maintenance"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "rfi") && (
              <ModuleLink
                href={`/projects/${id}/workflow/rfi`}
                icon={ListChecks}
                label="RFI / Workflow"
                desc="Requests for information"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "correspondence") && (
              <ModuleLink
                href={`/projects/${id}/correspondence`}
                icon={Mail}
                label="Correspondence"
                desc="Letter tracking & reply deadlines"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "drawings") && (
              <ModuleLink
                href={`/projects/${id}/drawings`}
                icon={FileQuestion}
                label="Drawings"
                desc="Drawing register & revisions"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "vat") && (
              <ModuleLink
                href={`/projects/${id}/tax-summary`}
                icon={BarChart3}
                label="VAT & Tax"
                desc="IRD Schedule 8/9/10 & TDS"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "production") && (
              <ModuleLink
                href={`/projects/${id}/production`}
                icon={Factory}
                label="Plant & Production"
                desc="Concrete & asphalt batching"
              />
            )}
            {isModuleEnabled(parseEnabledModules(project.enabledModules), "purchaseOrders") && (
              <ModuleLink
                href={`/projects/${id}/vendors`}
                icon={FolderArchive}
                label="Purchase Orders"
                desc="PO issuance & vendor bills"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamManager
              projectId={project.id}
              initialMembers={project.members.map((m) => ({
                id: m.id,
                role: m.role,
                user: m.user,
              }))}
              canManage={data.myRole === "project_manager" || data.myRole === "coordinator"}
            />
          </CardContent>
        </Card>

        {/* Cost rate configuration */}
        <CostRatesCard
          projectId={project.id}
          project={project}
          canEdit={data.myRole === "project_manager" || data.myRole === "coordinator"}
        />
      </div>

      {/* Module Settings */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 py-4">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Module Settings</CardTitle>
          <CardDescription className="text-xs mt-0">
            Show or hide modules for this project. Hidden modules are removed from navigation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectModulesTab
            projectId={project.id}
            canManage={data.myRole === "project_manager" || data.myRole === "coordinator"}
          />
        </CardContent>
      </Card>
    </AnimatedPage>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </Card>
  );
}

function ModuleLink({
  href,
  icon: Icon,
  label,
  desc,
  soon,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  soon?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded border border-border bg-card p-3 transition-all duration-150 hover:border-primary hover:shadow-[0_0_14px_rgba(245,158,11,0.22)] hover:bg-primary/5"
    >
      <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary border border-primary/30 group-hover:border-primary transition-colors">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-mono font-bold text-foreground group-hover:text-primary transition-colors tracking-tight">
            {label}
          </p>
          {soon && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono uppercase text-muted-foreground border border-border">
              soon
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}
