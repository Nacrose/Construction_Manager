"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, UserCheck, ArrowRight, FolderOpen, Activity, Shield, BookOpen } from "lucide-react";
import Link from "next/link";

export default function AdminDashboard() {
  const { data, isLoading } = trpc.admin.stats.useQuery();
  const { data: auditData } = trpc.admin.listAuditLogs.useQuery({ take: 10 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Admin</h1>
        <p className="text-sm text-muted-foreground">
          Cross-organization management for the platform operator.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{isLoading ? "…" : data?.orgCount}</div>
            <Link href="/admin/organizations" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{isLoading ? "…" : data?.userCount}</div>
            <Link href="/admin/users" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{isLoading ? "…" : data?.activeUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.userCount ? `${Math.round((data.activeUsers / data.userCount) * 100)}% of total` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{isLoading ? "…" : data?.projectCount ?? "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions + Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/admin/organizations" className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted transition-colors">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Manage Organizations
            </Link>
            <Link href="/admin/rate-catalogs" className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted transition-colors">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Rate Catalogs
            </Link>
            <Link href="/admin/audit" className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted transition-colors">
              <Activity className="h-4 w-4 text-muted-foreground" />
              View Audit Log
            </Link>
            <Link href="/admin/database" className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted transition-colors">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Database Setup
            </Link>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <Link href="/admin/audit" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {auditData && auditData.length > 0 ? (
              <div className="space-y-2">
                {auditData.slice(0, 8).map((log) => (
                  <div key={log.id} className="flex items-center gap-3 text-sm">
                    <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{log.user?.name ?? "System"}</span>
                      {" "}
                      <span className="text-muted-foreground">{log.action}</span>
                      {" "}
                      <span className="text-muted-foreground/60">{log.entityType}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
