"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Building2, Users, Database, BookOpen } from "lucide-react";

export default function AdminSettings() {
  const { data } = trpc.admin.stats.useQuery();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Platform-wide configuration and quick links.</p>
      </div>

      {/* Platform Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Platform Overview</CardTitle>
          <CardDescription className="text-xs">Live counts across all organizations.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-2xl font-bold">{data?.orgCount ?? "—"}</div>
            <div className="text-muted-foreground text-xs">Organizations</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data?.userCount ?? "—"}</div>
            <div className="text-muted-foreground text-xs">Users</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data?.activeUsers ?? "—"}</div>
            <div className="text-muted-foreground text-xs">Active Users</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data?.projectCount ?? "—"}</div>
            <div className="text-muted-foreground text-xs">Projects</div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quick Links</CardTitle>
          <CardDescription className="text-xs">Navigate to admin sections.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link href="/admin/organizations">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Building2 className="h-4 w-4" /> Manage Organizations
            </Button>
          </Link>
          <Link href="/admin/users">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Users className="h-4 w-4" /> Manage Users
            </Button>
          </Link>
          <Link href="/admin/rate-catalogs">
            <Button variant="outline" className="w-full justify-start gap-2">
              <BookOpen className="h-4 w-4" /> Rate Catalogs
            </Button>
          </Link>
          <Link href="/admin/database">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Database className="h-4 w-4" /> Database Setup
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>• The platform superadmin is seeded via <code>POST /api/setup</code> using <code>SETUP_SECRET</code>.</p>
          <p>• New organizations are bootstrapped through the signup flow or the Organizations page.</p>
          <p>• Billing / trial gating is not enabled in this build.</p>
        </CardContent>
      </Card>
    </div>
  );
}
