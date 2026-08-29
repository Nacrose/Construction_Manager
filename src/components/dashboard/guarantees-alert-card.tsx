"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { formatNpr } from "@/lib/currency";

export function GuaranteesAlertCard() {
  const { data, isLoading } = trpc.bankGuarantee.portfolioAlerts.useQuery(undefined, {
    staleTime: 60_000,
  });

  if (isLoading) {
    return null;
  }

  const expiringSoon = data?.expiringSoon || [];

  if (expiringSoon.length === 0) {
    return null;
  }

  return (
    <Card className="border-red-300 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 shadow-md overflow-hidden font-sans">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-red-900 dark:text-red-200">
                Action Required: {expiringSoon.length} Bank Guarantee{expiringSoon.length > 1 ? "s" : ""} Expiring Soon
              </CardTitle>
              <CardDescription className="text-xs text-red-700 dark:text-red-300">
                Extend or release active Performance Bonds, APGs, or CAR Policies before deadline to prevent bank penalties.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
          {expiringSoon.map((g) => {
            const isExpired = g.daysRemaining < 0;
            return (
              <div
                key={g.id}
                className="bg-card p-3 rounded-lg border shadow-sm flex flex-col justify-between space-y-2 text-xs"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded font-semibold text-muted-foreground">
                      {g.project?.code || "PROJ"}
                    </span>
                    {isExpired ? (
                      <Badge variant="destructive" className="text-[10px] font-mono">
                        Expired {Math.abs(g.daysRemaining)}d ago
                      </Badge>
                    ) : (
                      <Badge className="bg-red-600 text-white text-[10px] font-mono animate-pulse">
                        {g.daysRemaining} Days Remaining
                      </Badge>
                    )}
                  </div>

                  <div className="font-bold text-foreground mt-1 truncate">
                    {g.guaranteeNumber}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate font-mono">
                    {g.issuingBank} • {g.type.replace(/_/g, " ").toUpperCase()}
                  </div>
                </div>

                <div className="pt-2 border-t flex items-center justify-between font-mono">
                  <div>
                    <div className="text-[9px] text-muted-foreground uppercase">Value</div>
                    <div className="font-bold text-foreground">{formatNpr(g.amount)}</div>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-xs font-sans text-primary">
                    <Link href={`/projects/${g.projectId}/guarantees`}>
                      Extend →
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
