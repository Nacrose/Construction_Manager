"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users2, Building2 } from "lucide-react";
import { format } from "date-fns";

type Props = { projectId: string };

export function VisitorLog({ projectId }: Props) {
  const { data, isLoading } = trpc.dashboard.visitorLog.useQuery({ projectId });

  if (isLoading) return <Card><CardContent><Skeleton className="h-48" /></CardContent></Card>;
  if (!data || data.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Users2 className="h-4 w-4" /> Visitor Log</CardTitle></CardHeader>
        <CardContent><div className="text-center py-6 text-xs text-muted-foreground"><Users2 className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No visitors logged yet.</p></div></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Users2 className="h-4 w-4" /> Visitor Log</CardTitle>
        <CardDescription className="text-xs">
          {data.total} visits from {data.uniqueOrganizations} organizations
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Top organizations */}
        <div className="flex flex-wrap gap-1">
          {Object.entries(data.byOrg)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([org, count]) => (
              <span key={org} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                <Building2 className="h-2.5 w-2.5" />
                {org}: {count}
              </span>
            ))}
        </div>

        {/* Recent visits */}
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {data.visitors.slice(0, 20).map((v, i) => (
            <div key={i} className="flex items-center gap-2 rounded border p-1.5 text-xs hover:bg-muted/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-medium">{v.visitor}</span>
                  {v.organization !== "—" && <span className="text-[9px] text-muted-foreground">· {v.organization}</span>}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {v.purpose !== "—" && <span>{v.purpose} · </span>}
                  {v.reportDate ? format(new Date(v.reportDate), "dd MMM yyyy") : "—"}
                  {v.timeIn !== "—" && <span> · {v.timeIn}{v.timeOut !== "—" ? `–${v.timeOut}` : ""}</span>}
                </div>
              </div>
              <span className="text-[8px] text-muted-foreground font-mono shrink-0">{v.reportNumber}</span>
            </div>
          ))}
        </div>
        {data.visitors.length > 20 && <p className="text-[10px] text-muted-foreground text-center">+{data.visitors.length - 20} more</p>}
      </CardContent>
    </Card>
  );
}
