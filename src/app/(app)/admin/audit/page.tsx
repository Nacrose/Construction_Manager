"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default function AdminAudit() {
  const { data, isLoading } = trpc.admin.listAuditLogs.useQuery({});
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Recent platform admin actions.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : data && data.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No audit entries yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Actor</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs">Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {format(new Date(log.createdAt), "dd MMM yy HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs">{log.user?.name ?? "system"}</TableCell>
                    <TableCell className="text-xs font-medium">{log.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.entityType}:{log.entityId.slice(0, 8)}</TableCell>
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
