"use client";

import { format } from "date-fns";
import { Plus, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RequisitionDetailView } from "./requisition-detail-view";

export function MaterialsRequisitionsTab({
  projectId,
  canWrite,
  isAdmin,
  isReqsLoading,
  reqsData,
  reqStatusFilter,
  setReqStatusFilter,
  selectedRequisitionId,
  setSelectedRequisitionId,
  setCreateReqOpen,
}: {
  projectId: string;
  canWrite: boolean;
  isAdmin: boolean;
  isReqsLoading: boolean;
  reqsData: any;
  reqStatusFilter: string;
  setReqStatusFilter: (status: string) => void;
  selectedRequisitionId: string | null;
  setSelectedRequisitionId: (id: string | null) => void;
  setCreateReqOpen: (open: boolean) => void;
}) {
  if (selectedRequisitionId) {
    return (
      <RequisitionDetailView
        projectId={projectId}
        requisitionId={selectedRequisitionId}
        canWrite={canWrite}
        isAdmin={isAdmin}
        onClose={() => setSelectedRequisitionId(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
        <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg text-xs w-fit">
          {["all", "submitted", "approved", "partially_ordered", "ordered", "rejected"].map(
            (st) => (
              <button
                key={st}
                onClick={() => setReqStatusFilter(st)}
                className={cn(
                  "px-2.5 py-1 rounded-md capitalize transition-colors font-medium",
                  reqStatusFilter === st
                    ? "bg-card text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {st.replace("_", " ")}
              </button>
            )
          )}
        </div>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => setCreateReqOpen(true)}
            className="h-7.5 text-xs gap-1.5 bg-info hover:bg-info text-white rounded-lg"
          >
            <Plus className="h-3.5 w-3.5" /> New Requisition (PR)
          </Button>
        )}
      </div>

      {isReqsLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !reqsData?.requisitions?.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center bg-card">
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No purchase requisitions found</p>
          <p className="text-xs text-muted-foreground">
            Submit material requests with 3-vendor quotations for approval.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {reqsData.requisitions
            .filter((r: any) => reqStatusFilter === "all" || r.status === reqStatusFilter)
            .map((req: any) => {
              let statusBadge = "bg-muted text-muted-foreground";
              if (req.status === "approved")
                statusBadge =
                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
              if (req.status === "partially_ordered")
                statusBadge = "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info/80";
              if (req.status === "ordered")
                statusBadge =
                  "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
              if (req.status === "rejected")
                statusBadge = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
              if (req.status === "submitted")
                statusBadge =
                  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";

              const totalAmount = req.items.reduce((acc: number, it: any) => {
                const selQuote = it.quotes.find((q: any) => q.partnerId === it.selectedPartnerId);
                const rate = selQuote ? selQuote.exFactoryRate + selQuote.transportRate : 0;
                return acc + it.quantity * rate;
              }, 0);

              return (
                <Card
                  key={req.id}
                  className="flex flex-col justify-between overflow-hidden cursor-pointer hover:border-info/50 transition-all shadow-2xs rounded-xl"
                  onClick={() => setSelectedRequisitionId(req.id)}
                >
                  <CardHeader className="bg-muted/10 pb-2 pt-3 px-3.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {req.number}
                        </Badge>
                        <CardTitle className="text-xs font-semibold mt-1">
                          Req by: {req.createdBy.name}
                        </CardTitle>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`${statusBadge} font-normal capitalize text-[10px]`}
                      >
                        {req.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2.5 px-3.5 flex-1 text-xs space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                      <span>Submitted: {format(new Date(req.createdAt), "dd MMM yyyy")}</span>
                      {req.stats && (
                        <span className="font-semibold text-foreground">
                          {req.stats.fullyOrderedCount} / {req.stats.totalItems} Items Ordered
                        </span>
                      )}
                    </div>
                    <div className="border-t border-b py-1.5 my-1 space-y-1 max-h-[80px] overflow-y-auto text-xs">
                      {req.items.map((it: any) => (
                        <div key={it.id} className="flex justify-between text-xs">
                          <span className="font-medium text-muted-foreground truncate">
                            {it.material.name}
                          </span>
                          <span className="font-mono shrink-0">
                            {it.orderedQty ? `${it.orderedQty}/` : ""}
                            {it.quantity} {it.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center pt-0.5">
                      <span className="text-[10px] text-muted-foreground">Quote Value</span>
                      <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 font-mono">
                        NPR {totalAmount.toLocaleString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
