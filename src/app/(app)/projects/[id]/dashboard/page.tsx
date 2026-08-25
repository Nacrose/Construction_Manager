"use client";

import { use } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { AnimatedPage } from "@/components/ui/animated-page";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, BarChart3 } from "lucide-react";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { CostVsBudget } from "@/components/dashboard/cost-vs-budget";
import { RfiMetrics } from "@/components/dashboard/rfi-metrics";
import { ProgressSCurve } from "@/components/dashboard/progress-scurve";
import { DelayRegister } from "@/components/dashboard/delay-register";
import { QualityTestRegister } from "@/components/dashboard/quality-test-register";
import { PhotoTimeline } from "@/components/dashboard/photo-timeline";
import { CashFlowForecast } from "@/components/dashboard/cash-flow-forecast";
import { VisitorLog } from "@/components/dashboard/visitor-log";
import { LowStockAlerts } from "@/components/inventory/low-stock-alerts";
import { CostSummaryCard } from "@/components/costs/cost-summary-card";
import { WeatherProductivityChart } from "@/components/dashboard/weather-productivity-chart";
import { DelayAnalyticsChart } from "@/components/dashboard/delay-analytics-chart";

export default function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  if (!projectInfo) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const canWrite = projectInfo.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector";

  return (
    <AnimatedPage className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/projects/${id}`} className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> {projectInfo.project.name}
        </Link>
        <span>/</span>
        <span>Dashboard</span>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Project Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time transparency: costs, progress, RFIs, inventory, and activity.
        </p>
      </div>

      {/* Low stock alerts */}
      <LowStockAlerts projectId={id} />

      {/* Top row: Cost vs Budget + RFI Metrics */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CostVsBudget projectId={id} />
        <RfiMetrics projectId={id} />
      </div>

      {/* Second row: S-Curve (full width) */}
      <ProgressSCurve projectId={id} />

      {/* Third row: Activity Feed + Cost Summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ActivityFeed projectId={id} limit={50} />
        <CostSummaryCard projectId={id} canWrite={!!canWrite} />
      </div>

      {/* Fourth row: Delay Register + Cash Flow */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DelayRegister projectId={id} />
        <CashFlowForecast projectId={id} />
      </div>

      {/* Fifth row: Quality Tests + Visitor Log */}
      <div className="grid gap-4 lg:grid-cols-2">
        <QualityTestRegister projectId={id} />
        <VisitorLog projectId={id} />
      </div>

      {/* Sixth row: Photo Timeline (full width) */}
      <PhotoTimeline projectId={id} />

      {/* Seventh row: Weather Impact + Delay Analytics */}
      <div className="grid gap-4 lg:grid-cols-2">
        <WeatherProductivityChart projectId={id} />
        <DelayAnalyticsChart projectId={id} />
      </div>
    </AnimatedPage>
  );
}
