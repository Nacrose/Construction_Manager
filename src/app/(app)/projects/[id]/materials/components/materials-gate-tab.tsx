"use client";

import { Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export type GateEntry = {
  id: string;
  number: string;
  vehicleNo: string;
  challanNo?: string | null;
  description?: string | null;
  status: string;
  supplier?: { name: string } | null;
};

export function MaterialsGateTab({
  canWrite,
  isGateLoading,
  gateData,
  setAddGateOpen,
  openGateVerification,
}: {
  canWrite: boolean;
  isGateLoading: boolean;
  gateData: any;
  setAddGateOpen: (open: boolean) => void;
  openGateVerification: (gate: GateEntry) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">
          Trucks arrived at site with delivery challans & weighbridge slips
        </span>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => setAddGateOpen(true)}
            className="h-7.5 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
          >
            <Truck className="h-3.5 w-3.5" /> Log Gate Entry (Weighbridge)
          </Button>
        )}
      </div>

      {isGateLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !gateData?.gateEntries?.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center bg-card">
          <Truck className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No vehicles registered at gate</p>
          <p className="text-xs text-muted-foreground">
            Register truck arrivals to compute weighbridge net weight and generate GRNs.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {gateData.gateEntries.map((g: any) => (
            <Card
              key={g.id}
              className="p-3 flex flex-col justify-between rounded-xl shadow-2xs border"
            >
              <div className="space-y-1.5">
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className="font-mono text-xs">
                    {g.number}
                  </Badge>
                  <Badge
                    className={
                      g.status === "pending"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 capitalize text-[10px]"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 capitalize text-[10px]"
                    }
                  >
                    {g.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">Reg: {g.vehicleNo}</div>
                  {g.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Cargo: {g.description}
                    </p>
                  )}
                  {g.challanNo && (
                    <p className="text-[10px] text-muted-foreground">
                      Challan:{" "}
                      <span className="font-mono font-medium text-foreground">{g.challanNo}</span>
                    </p>
                  )}
                </div>
              </div>
              {canWrite && g.status === "pending" && (
                <div className="border-t pt-2 mt-2 flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => openGateVerification(g)}
                    className="h-6.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-md"
                  >
                    Verify & Unload (GRN)
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
