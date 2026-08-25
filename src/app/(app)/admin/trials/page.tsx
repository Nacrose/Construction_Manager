"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminTrials() {
  const { data, isLoading } = trpc.admin.listOrganizations.useQuery({});
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trials & Status</h1>
        <p className="text-sm text-muted-foreground">
          Organization lifecycle status. (Billing/trial gating is not enabled in this build.)
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Organization</TableHead>
                  <TableHead className="text-xs">Code</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Members</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.orgs.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium text-sm">{o.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{o.code}</TableCell>
                    <TableCell><Badge variant={o.status === "active" ? "default" : "secondary"}>{o.status}</Badge></TableCell>
                    <TableCell className="text-sm">{o._count.users}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
