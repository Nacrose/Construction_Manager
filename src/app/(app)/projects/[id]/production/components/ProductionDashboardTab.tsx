"use client";

import { Factory, Flame, Zap, AlertTriangle, Fuel, Sliders, TrendingUp, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ProductionDashboardTab({
  summaryLoading,
  summaryData,
  plants,
  canWrite,
  setEditSiloTarget,
  mixDesigns,
  calcMixId,
  setCalcMixId,
  selectedCalcMix,
  calcBatchVolume,
  setCalcBatchVolume,
}: {
  summaryLoading: boolean;
  summaryData: any;
  plants: any[];
  canWrite: boolean;
  setEditSiloTarget: (silo: any) => void;
  mixDesigns: any[];
  calcMixId: string;
  setCalcMixId: (id: string) => void;
  selectedCalcMix: any;
  calcBatchVolume: number;
  setCalcBatchVolume: (val: number) => void;
}) {
  return (
    <div className="space-y-4">
      {summaryLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card shadow-sm border-info/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Today Concrete Dispatched
                </p>
                <Factory className="h-4 w-4 text-info" />
              </div>
              <p className="text-2xl font-bold font-mono text-foreground mt-1">
                {summaryData?.concreteToday ?? 0}{" "}
                <span className="text-xs font-normal text-muted-foreground">m³</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" /> Cumulative:{" "}
                {summaryData?.cumulativeConcrete ?? 0} m³
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-amber-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Today Asphalt Dispatched
                </p>
                <Flame className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold font-mono text-foreground mt-1">
                {summaryData?.asphaltToday ?? 0}{" "}
                <span className="text-xs font-normal text-muted-foreground">MT</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" /> Cumulative:{" "}
                {summaryData?.cumulativeAsphalt ?? 0} MT
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-emerald-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Active Plants Operating
                </p>
                <Zap className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold font-mono text-foreground mt-1">
                {summaryData?.activePlantsCount ?? 0} / {summaryData?.totalPlantsCount ?? 0}
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                {summaryData?.inTransitCount ?? 0} transit mixers / tippers in transit
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Silo Low-Stock Alerts
                </p>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <p className="text-2xl font-bold font-mono text-foreground mt-1">
                {summaryData?.lowStockAlerts?.length ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {summaryData?.lowStockAlerts?.length
                  ? "Immediate refilling required"
                  : "All silos above safe threshold"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Plant Silos Visual Stock Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Fuel className="h-4 w-4 text-info" /> Plant Silos & Bunkers Live Stock Levels
                </CardTitle>
                <CardDescription className="text-xs">
                  Bulk cement silos, aggregate stockyard bins, and bitumen storage tanks.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[11px]">
                Auto-deducted on batch dispatch
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {plants.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No plants registered. Click &quot;Add Plant&quot; to set up your Concrete or Asphalt
                plant.
              </div>
            ) : (
              plants.map((p) => (
                <div key={p.id} className="rounded-lg border p-3.5 space-y-3 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Factory className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-xs text-foreground">{p.name}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {p.code || p.type.replace("_", " ")}
                      </Badge>
                    </div>
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      Today: {p.todayOutput} {p.capacityUnit?.split("/")[0] || "m³"} (
                      {p.todayTickets} loads)
                    </span>
                  </div>

                  {/* Silos Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {p.silos?.map((silo: any) => {
                      const pct =
                        silo.capacity > 0
                          ? Math.min(100, Math.round((silo.currentStock / silo.capacity) * 100))
                          : 0;
                      const isLow =
                        silo.minAlertLevel !== null && silo.currentStock <= silo.minAlertLevel;

                      return (
                        <div
                          key={silo.id}
                          className={cn(
                            "rounded-md border p-2.5 bg-card relative cursor-pointer hover:border-primary transition-colors",
                            isLow && "border-red-400 bg-red-50/20 dark:border-red-800"
                          )}
                          onClick={() => {
                            if (canWrite) setEditSiloTarget(silo);
                          }}
                          title="Click to adjust stock or record dip"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-foreground truncate pr-1">
                              {silo.name}
                            </span>
                            {isLow && <span className="text-[10px] text-red-500 font-bold">LOW</span>}
                          </div>
                          <div className="mt-1.5 flex items-baseline justify-between">
                            <span className="font-mono text-sm font-bold text-foreground">
                              {silo.currentStock}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              / {silo.capacity} {silo.unit}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted mt-1.5 overflow-hidden">
                            <div
                              className={cn(
                                "h-full transition-all duration-300",
                                isLow ? "bg-red-500" : pct < 30 ? "bg-amber-500" : "bg-emerald-500"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Quick Interactive Batch Calculator */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sliders className="h-4 w-4 text-emerald-600" /> Batch Recipe Calculator
            </CardTitle>
            <CardDescription className="text-xs">
              Calculate exact ingredient weight for a batch transit mixer or tipper load.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Select Job Mix Formula</Label>
              <Select value={calcMixId || selectedCalcMix?.id} onValueChange={setCalcMixId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose Mix Design" />
                </SelectTrigger>
                <SelectContent>
                  {mixDesigns.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.code} — {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Batch Quantity ({selectedCalcMix?.unit || "cum"})</Label>
              <Input
                type="number"
                step="0.5"
                value={calcBatchVolume}
                onChange={(e) => setCalcBatchVolume(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-mono font-medium"
                placeholder="6.0"
              />
            </div>

            {selectedCalcMix ? (
              <div className="rounded-md border bg-muted/20 p-2.5 space-y-2 mt-2">
                <div className="flex items-center justify-between text-[11px] border-b pb-1">
                  <span className="font-semibold text-foreground">
                    {selectedCalcMix.code} ({calcBatchVolume} {selectedCalcMix.unit})
                  </span>
                  {selectedCalcMix.targetSlumpMm && (
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Droplets className="h-3 w-3 text-info" /> Slump:{" "}
                      {selectedCalcMix.targetSlumpMm} mm
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {selectedCalcMix.ingredientsList?.length ? (
                    selectedCalcMix.ingredientsList.map((ing: any, i: number) => {
                      const totalDosage = (Number(ing.dosagePerUnit) || 0) * calcBatchVolume;
                      return (
                        <div key={i} className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">{ing.name}</span>
                          <span className="font-mono font-medium text-foreground">
                            {totalDosage.toLocaleString("en-IN", { maximumFractionDigits: 1 })}{" "}
                            {ing.unit}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic">
                      No ingredients defined in this recipe.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No mix recipe selected.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
