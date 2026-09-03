"use client";

import { Factory } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLANT_TYPE_LABELS } from "./types";

export function PlantsManagementTab({
  plants,
  canWrite,
  setEditSiloTarget,
}: {
  plants: any[];
  canWrite: boolean;
  setEditSiloTarget: (silo: any) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {plants.map((p) => {
        const PlantIcon = PLANT_TYPE_LABELS[p.type]?.icon || Factory;
        return (
          <Card key={p.id} className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <PlantIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold">{p.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {p.makeModel || "Stationary Plant"} · {p.location || "Base Yard"}
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] capitalize",
                    p.status === "active"
                      ? "bg-success/15 text-success"
                      : "bg-amber-100 text-amber-800"
                  )}
                >
                  {p.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-md bg-muted/20 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Capacity</span>
                  <span className="font-bold">
                    {p.capacityValue || 30} {p.capacityUnit}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Silos / Bins</span>
                  <span className="font-bold">{p._count?.silos ?? p.silos?.length ?? 0} units</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Total Loads</span>
                  <span className="font-bold">{p._count?.batchTickets ?? 0}</span>
                </div>
              </div>

              {/* Silos list */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Attached Storage Silos
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {p.silos?.map((silo: any) => (
                    <div
                      key={silo.id}
                      className="rounded border p-2 text-xs bg-card cursor-pointer hover:border-primary transition-colors"
                      onClick={() => {
                        if (canWrite) setEditSiloTarget(silo);
                      }}
                    >
                      <span className="text-[11px] font-medium text-foreground block truncate">
                        {silo.name}
                      </span>
                      <span className="font-mono text-xs font-bold text-foreground">
                        {silo.currentStock} / {silo.capacity} {silo.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
