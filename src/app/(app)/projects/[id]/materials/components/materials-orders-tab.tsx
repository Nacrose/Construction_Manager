"use client";

import { format } from "date-fns";
import { Plus, ClipboardList, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export function MaterialsOrdersTab({
  data,
  isLoading,
  canWrite,
  setCreatePOOpen,
  setSelectedPoForPrint,
  setPoPrintOpen,
  project,
  projectId,
  updatePOStatusMutation,
}: {
  data: any;
  isLoading: boolean;
  canWrite: boolean;
  setCreatePOOpen: (open: boolean) => void;
  setSelectedPoForPrint: (po: any) => void;
  setPoPrintOpen: (open: boolean) => void;
  project: any;
  projectId: string;
  updatePOStatusMutation: any;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">
          Active and historical Purchase Orders issued to suppliers
        </span>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => setCreatePOOpen(true)}
            className="h-7.5 text-xs gap-1.5 bg-info hover:bg-info text-white rounded-lg"
          >
            <Plus className="h-3.5 w-3.5" /> Draft Purchase Order
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !data?.purchaseOrders?.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center bg-card">
          <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No purchase orders found</p>
          <p className="text-xs text-muted-foreground">
            Draft a PO directly or approve a Requisition to generate orders.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.purchaseOrders.map((po: any) => {
            let statusBadge = "bg-muted text-foreground/80 dark:bg-[var(--navy-mid)] dark:text-foreground/80";
            if (po.status === "issued")
              statusBadge = "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info/80";
            if (po.status === "received")
              statusBadge =
                "bg-success/15 text-success dark:bg-success dark:text-success/80";
            if (po.status === "cancelled")
              statusBadge = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";

            return (
              <Card
                key={po.id}
                className="flex flex-col justify-between overflow-hidden rounded-xl border shadow-2xs"
              >
                <CardHeader className="bg-muted/10 pb-2 pt-3 px-3.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {po.number}
                      </Badge>
                      <CardTitle className="text-sm font-semibold mt-1">
                        {po.partner?.name || po.supplier?.name || "Vendor"}
                      </CardTitle>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`${statusBadge} font-normal capitalize text-[10px]`}
                    >
                      {po.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="py-2.5 px-3.5 flex-1 text-xs space-y-1.5">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Date: {format(new Date(po.orderDate), "dd MMM yyyy")}</span>
                    {po.expectedDate && (
                      <span>Expected: {format(new Date(po.expectedDate), "dd MMM yyyy")}</span>
                    )}
                  </div>
                  <div className="border-t border-b py-1.5 my-1 space-y-1.5 max-h-[85px] overflow-y-auto">
                    {po.items.map((item: any) => {
                      const progressPercent =
                        item.quantity > 0
                          ? Math.min(
                              100,
                              Math.round(((item.receivedQty || 0) / item.quantity) * 100)
                            )
                          : 0;
                      return (
                        <div key={item.id} className="space-y-0.5">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-foreground truncate">
                              {item.material.name}
                            </span>
                            <span className="font-mono shrink-0">
                              {item.receivedQty || 0} / {item.quantity} {item.material.unit}
                            </span>
                          </div>
                          <Progress value={progressPercent} className="h-1 bg-muted" />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between items-center pt-0.5">
                    <span className="text-[10px] text-muted-foreground">Total (incl. VAT)</span>
                    <span className="font-bold text-xs text-success dark:text-success/80 font-mono">
                      NPR {po.totalAmount.toLocaleString()}
                    </span>
                  </div>
                </CardContent>
                <div className="border-t p-2.5 bg-muted/5 flex justify-between items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 rounded-md"
                    onClick={() => {
                      setSelectedPoForPrint({
                        ...po,
                        project,
                      });
                      setPoPrintOpen(true);
                    }}
                  >
                    <Printer className="h-3 w-3" />
                    Print PO
                  </Button>

                  {canWrite && po.status !== "received" && po.status !== "cancelled" && (
                    <div className="flex gap-1.5">
                      {po.status === "draft" && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs bg-info hover:bg-info text-white rounded-md"
                          onClick={() =>
                            updatePOStatusMutation.mutate({
                              projectId,
                              poId: po.id,
                              status: "issued",
                            })
                          }
                        >
                          Issue PO
                        </Button>
                      )}
                      {po.status === "issued" && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs bg-success hover:bg-success text-white rounded-md"
                          onClick={() =>
                            updatePOStatusMutation.mutate({
                              projectId,
                              poId: po.id,
                              status: "received",
                            })
                          }
                        >
                          Mark Received
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
