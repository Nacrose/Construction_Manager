"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AdminSettings() {
  const { data } = trpc.admin.stats.useQuery();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Platform-wide configuration.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Platform Overview</CardTitle>
          <CardDescription className="text-xs">Live counts across all organizations.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <div><div className="text-2xl font-bold">{data?.orgCount ?? "—"}</div><div className="text-muted-foreground text-xs">Organizations</div></div>
          <div><div className="text-2xl font-bold">{data?.userCount ?? "—"}</div><div className="text-muted-foreground text-xs">Users</div></div>
          <div><div className="text-2xl font-bold">{data?.activeUsers ?? "—"}</div><div className="text-muted-foreground text-xs">Active Users</div></div>
        </CardContent>
      </Card>
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
