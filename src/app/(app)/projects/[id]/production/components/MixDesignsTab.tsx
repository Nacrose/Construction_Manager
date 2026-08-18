"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

export function MixDesignsTab({ mixDesigns }: { mixDesigns: any[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {mixDesigns.length === 0 ? (
        <div className="col-span-full py-12 text-center text-xs text-muted-foreground border rounded-lg p-6">
          No Mix Designs created yet. Click &quot;New Mix Recipe&quot; to set up M20, M25 concrete,
          DBM, or Asphalt formulas.
        </div>
      ) : (
        mixDesigns.map((m) => (
          <Card key={m.id} className="shadow-sm border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="font-mono text-xs font-bold">
                  {m.code}
                </Badge>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {m.type}
                </Badge>
              </div>
              <CardTitle className="text-sm font-bold text-foreground mt-1">{m.name}</CardTitle>
              <CardDescription className="text-xs">Plant: {m.plant.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/20 p-2 rounded-md">
                {m.targetSlumpMm && (
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Target Slump</span>
                    <span className="font-medium">{m.targetSlumpMm} mm</span>
                  </div>
                )}
                {m.targetTempC && (
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Mix Temp</span>
                    <span className="font-medium">{m.targetTempC} °C</span>
                  </div>
                )}
                {m.waterCementRatio && (
                  <div>
                    <span className="text-[10px] text-muted-foreground block">W/C Ratio</span>
                    <span className="font-medium">{m.waterCementRatio}</span>
                  </div>
                )}
                {m.bitumenContentPct && (
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Bitumen %</span>
                    <span className="font-medium">{m.bitumenContentPct}%</span>
                  </div>
                )}
              </div>

              {/* Ingredients Table */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Ingredients Dosage (per {m.unit})
                </p>
                <div className="rounded border bg-card overflow-hidden">
                  <Table>
                    <TableBody>
                      {m.ingredientsList?.map((ing: any, idx: number) => (
                        <TableRow key={idx} className="h-6 text-[11px]">
                          <TableCell className="py-1 px-2 text-muted-foreground">{ing.name}</TableCell>
                          <TableCell className="py-1 px-2 text-right font-mono font-medium">
                            {ing.dosagePerUnit} {ing.unit}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
