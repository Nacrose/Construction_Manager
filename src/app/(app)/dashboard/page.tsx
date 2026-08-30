"use client";

import { fetchWithAuth } from "@/lib/client-auth";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderKanban, FileQuestion, Clock, CheckCircle2, ArrowRight, Banknote, TrendingUp, Activity, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
// Recharts is loaded on demand via a single dynamic import wrapper.
// This keeps the dashboard's initial bundle small (~760 KB savings).
// Charts render after first paint.
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import {
  AnimatedPage, StaggerContainer, StaggerItem, SpringCard, AnimatedCounter, FadeInOnScroll, GlowOrb,
} from "@/components/ui/motion";
import { CrossProjectFinancialsCard } from "@/components/dashboard/cross-project-financials-card";
import { GuaranteesAlertCard } from "@/components/dashboard/guarantees-alert-card";

type DashboardData = {
  stats: {
    projects: number;
    openRfis: number;
    draftRfis: number;
    approvedRfis: number;
    totalContractValue: number;
  };
  recentRfis: Array<{
    id: string; number: string; subject: string; status: string;
    priority: string; createdAt: string;
    project: { id: string; name: string; code: string };
  }>;
  projectsByStatus: { active: number; on_hold: number; completed: number; archived: number };
  costBreakdown: Array<{ section: string; amount: number }>;
  rfiByStatus: Array<{ status: string; count: number }>;
  cashFlow: Array<{ month: string; billed: number; paid: number }>;
  projectProgress: Array<{
    id: string; name: string; code: string;
    physical: number; financial: number; contractValue: number;
  }>;
};

// Navy + amber palette
const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  submitted: "#f59e0b",  // amber
  approved: "#1e3a8a",   // navy
  rejected: "#ef4444",
  closed: "#64748b",
};

const SECTION_COLORS = ["#1e3a8a", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/dashboard");
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <AnimatedPage className="space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </AnimatedPage>
    );
  }

  const stats = data?.stats;
  const cards = [
    {
      label: "Projects",
      value: stats?.projects ?? 0,
      icon: FolderKanban,
      href: "/projects",
      glow: "navy" as const,
      iconBg: "bg-navy-gradient",
    },
    {
      label: "Open RFIs",
      value: stats?.openRfis ?? 0,
      icon: FileQuestion,
      href: "/projects",
      glow: "amber" as const,
      iconBg: "bg-amber-gradient",
    },
    {
      label: "Draft RFIs",
      value: stats?.draftRfis ?? 0,
      icon: Clock,
      href: "/projects",
      glow: "navy" as const,
      iconBg: "bg-navy-gradient",
    },
    {
      label: "Approved RFIs",
      value: stats?.approvedRfis ?? 0,
      icon: CheckCircle2,
      href: "/projects",
      glow: "amber" as const,
      iconBg: "bg-amber-gradient",
    },
  ];

  const totalContract = stats?.totalContractValue ?? 0;
  const totalCost = data?.costBreakdown.reduce((s, c) => s + c.amount, 0) ?? 0;

  return (
    <AnimatedPage className="space-y-8 pb-8">
      {/* Hero Banner — cinematic navy gradient with animated glow */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl bg-navy-gradient p-8 sm:p-10 text-white shadow-2xl glow-navy"
      >
        <GlowOrb color="amber" size={400} className="-top-20 -right-20 opacity-40" />
        <GlowOrb color="navy" size={300} className="-bottom-20 -left-20 opacity-30" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
          }}
        />

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm"
          >
            <Sparkles className="h-3 w-3 text-amber-300" />
            <span className="text-white/80">Executive Overview</span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-4xl font-bold tracking-tight sm:text-5xl"
          >
            Dashboard
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-3 max-w-xl text-lg text-white/70"
          >
            Real-time view of your active projects, financial health, and field activity.
          </motion.p>

          {/* Inline contract value counter */}
          {totalContract > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-6 flex flex-wrap items-center gap-6"
            >
              <div>
                <p className="text-xs uppercase tracking-wider text-white/50">Total Contract Value</p>
                <p className="font-mono text-3xl font-bold text-gradient-amber">
                  <AnimatedCounter
                    value={totalContract}
                    prefix="NPR "
                    format={(n) => Math.round(n).toLocaleString("en-IN")}
                  />
                </p>
              </div>
              <div className="h-12 w-px bg-white/20" />
              <div>
                <p className="text-xs uppercase tracking-wider text-white/50">Total BOQ Value</p>
                <p className="font-mono text-2xl font-semibold text-white">
                  <AnimatedCounter
                    value={totalCost}
                    prefix="NPR "
                    format={(n) => Math.round(n).toLocaleString("en-IN")}
                  />
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* KPI cards — staggered reveal */}
      <StaggerContainer className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" stagger={0.1}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <StaggerItem key={c.label}>
              <SpringCard glow={c.glow}>
                <Card className="group relative h-full overflow-hidden p-6 transition-colors hover:border-primary/30">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{c.label}</p>
                      <p className="font-mono text-4xl font-bold tracking-tight text-foreground">
                        <AnimatedCounter value={c.value} />
                      </p>
                    </div>
                    <motion.div
                      whileHover={{ rotate: 12, scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${c.iconBg} shadow-lg`}
                    >
                      <Icon className="h-6 w-6 text-white" />
                    </motion.div>
                  </div>
                  {c.href && (
                    <Link href={c.href} className="absolute inset-0 z-10">
                      <span className="sr-only">View {c.label}</span>
                    </Link>
                  )}
                  {/* Subtle bottom accent */}
                  <div className={`absolute bottom-0 left-0 right-0 h-1 ${c.iconBg} opacity-0 transition-opacity group-hover:opacity-100`} />
                </Card>
              </SpringCard>
            </StaggerItem>
          );
        })}
      </StaggerContainer>

      {/* Cross-Project Bank Guarantees Expiry Alert */}
      <GuaranteesAlertCard />

      {/* Cross-Project Financials & Portfolio P&L */}
      <FadeInOnScroll>
        <CrossProjectFinancialsCard />
      </FadeInOnScroll>

      {/* Charts row — fade in on scroll */}
      <div className="grid gap-5 lg:grid-cols-2">
        <FadeInOnScroll>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" /> Cost Breakdown by Section
              </CardTitle>
              <CardDescription>BOQ amounts grouped by section</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.costBreakdown.length ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data.costBreakdown}
                      dataKey="amount"
                      nameKey="section"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {data.costBreakdown.map((_, i) => (
                        <Cell key={i} fill={SECTION_COLORS[i % SECTION_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => `NPR ${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">No BOQ data yet.</p>
              )}
            </CardContent>
          </Card>
        </FadeInOnScroll>

        <FadeInOnScroll delay={0.15}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" /> RFI Status
              </CardTitle>
              <CardDescription>Requests for information by status</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.rfiByStatus.length ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data.rfiByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {data.rfiByStatus.map((entry, i) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.status] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", textTransform: "capitalize" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">No RFIs yet.</p>
              )}
            </CardContent>
          </Card>
        </FadeInOnScroll>
      </div>

      {/* Cash flow + project progress */}
      <div className="grid gap-5 lg:grid-cols-2">
        <FadeInOnScroll>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Banknote className="h-4 w-4 text-primary" /> Cash Flow
              </CardTitle>
              <CardDescription>Billed vs paid by IPC period</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.cashFlow.length ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.cashFlow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} />
                    <Tooltip
                      formatter={(v: number) => `NPR ${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="billed" fill="#1e3a8a" name="Billed" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="paid" fill="#f59e0b" name="Paid" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">No IPC data yet.</p>
              )}
            </CardContent>
          </Card>
        </FadeInOnScroll>

        <FadeInOnScroll delay={0.15}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" /> Project Progress
              </CardTitle>
              <CardDescription>Physical vs financial progress</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.projectProgress.length ? (
                <div className="space-y-3">
                  {data.projectProgress.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1, duration: 0.5 }}
                    >
                      <Link href={`/projects/${p.id}`} className="block rounded-xl border border-border/60 p-3 transition-all hover:border-primary/30 hover:bg-muted/30 hover:shadow-sm">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold">{p.code} · {p.name}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                        </div>
                        <div className="space-y-2">
                          <div>
                            <div className="mb-1 flex justify-between text-xs">
                              <span className="text-muted-foreground">Physical</span>
                              <span className="font-mono font-medium">{p.physical.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: `${p.physical}%` }}
                                viewport={{ once: true }}
                                transition={{ duration: 1, delay: i * 0.1 + 0.3, ease: [0.22, 1, 0.36, 1] }}
                                className="h-full rounded-full bg-navy-gradient"
                              />
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 flex justify-between text-xs">
                              <span className="text-muted-foreground">Financial</span>
                              <span className="font-mono font-medium">{p.financial.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: `${p.financial}%` }}
                                viewport={{ once: true }}
                                transition={{ duration: 1, delay: i * 0.1 + 0.4, ease: [0.22, 1, 0.36, 1] }}
                                className="h-full rounded-full bg-amber-gradient"
                              />
                            </div>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">No projects yet.</p>
              )}
            </CardContent>
          </Card>
        </FadeInOnScroll>
      </div>

      {/* Recent RFIs */}
      <FadeInOnScroll>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Recent RFIs
              <Badge variant="secondary" className="ml-2 text-xs">{data?.recentRfis.length ?? 0}</Badge>
            </CardTitle>
            <CardDescription>Latest requests for information across your projects.</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.recentRfis.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No RFIs yet.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {data?.recentRfis.map((rfi, i) => (
                  <motion.li
                    key={rfi.id}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link
                      href={`/projects/${rfi.project.id}/rfis`}
                      className="group flex items-center justify-between gap-4 rounded-lg px-3 py-3 -mx-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{rfi.number}</span>
                          <StatusBadge status={rfi.status} size="xs" />
                        </div>
                        <p className="mt-1 truncate text-sm font-medium">{rfi.subject}</p>
                        <p className="truncate text-xs text-muted-foreground">{rfi.project.code} · {rfi.project.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(rfi.createdAt), { addSuffix: true })}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
                      </div>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeInOnScroll>
    </AnimatedPage>
  );
}
