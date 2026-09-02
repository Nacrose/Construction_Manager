"use client";

import { useState } from "react";
import { Scale, ArrowRight, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const DENSITY_PRESETS = [
  { name: "Sand / Fine Aggregate", density: 1550, unit: "cum", label: "Sand (1,550 kg/m³)" },
  { name: "Aggregate 20mm (Crushed)", density: 1500, unit: "cum", label: "20mm Aggregate (1,500 kg/m³)" },
  { name: "Aggregate 40mm (Coarse)", density: 1450, unit: "cum", label: "40mm Aggregate (1,450 kg/m³)" },
  { name: "Crusher Run / Sub-base (GSB)", density: 1650, unit: "cum", label: "GSB / Sub-Base (1,650 kg/m³)" },
  { name: "Stone Dust / Quarry Dust", density: 1600, unit: "cum", label: "Stone Dust (1,600 kg/m³)" },
  { name: "Bitumen VG-30 (Liquid)", density: 1020, unit: "ltr", label: "Bitumen VG-30 (1.02 kg/L)" },
  { name: "Cement (Bulk)", density: 1440, unit: "bag", label: "Cement Bulk (50 kg/bag)" },
  { name: "Structural Steel / Rebar", density: 1000, unit: "MT", label: "Steel / Rebar (1,000 kg/MT)" },
  { name: "Custom Density", density: 0, unit: "cum", label: "Custom Density..." },
];

interface WeighbridgeCalculatorProps {
  initialUnit?: string;
  onApply: (data: {
    grossWeight: number;
    tareWeight: number;
    netWeight: number;
    densityFactor: number;
    computedQty: number;
    computedUnit: string;
  }) => void;
}

export function WeighbridgeCalculator({ initialUnit = "cum", onApply }: WeighbridgeCalculatorProps) {
  const [grossWeight, setGrossWeight] = useState<number | "">("");
  const [tareWeight, setTareWeight] = useState<number | "">("");
  const [selectedPreset, setSelectedPreset] = useState<string>("Sand / Fine Aggregate");
  const [customDensity, setCustomDensity] = useState<number | "">(1550);
  const [targetUnit, setTargetUnit] = useState<string>(initialUnit || "cum");

  const gross = Number(grossWeight) || 0;
  const tare = Number(tareWeight) || 0;
  const netKg = Math.max(0, gross - tare);

  const activePreset = DENSITY_PRESETS.find((p) => p.name === selectedPreset);
  const effectiveDensity = selectedPreset === "Custom Density" ? (Number(customDensity) || 1) : (activePreset?.density || 1550);

  // Compute quantity based on target unit
  let computedQty = 0;
  if (targetUnit === "cum" || targetUnit === "m3" || targetUnit === "m³") {
    computedQty = effectiveDensity > 0 ? netKg / effectiveDensity : 0;
  } else if (targetUnit === "MT" || targetUnit === "ton" || targetUnit === "tonne") {
    computedQty = netKg / 1000;
  } else if (targetUnit === "bag" || targetUnit === "bags") {
    computedQty = netKg / 50;
  } else if (targetUnit === "ltr" || targetUnit === "liter") {
    computedQty = effectiveDensity > 0 ? netKg / (effectiveDensity / 1000) : netKg;
  } else if (targetUnit === "kg") {
    computedQty = netKg;
  } else {
    // Default to density volumetric
    computedQty = effectiveDensity > 0 ? netKg / effectiveDensity : netKg;
  }

  const roundedQty = Math.round(computedQty * 1000) / 1000;
  const netMT = Math.round((netKg / 1000) * 1000) / 1000;

  const handleApply = () => {
    onApply({
      grossWeight: gross,
      tareWeight: tare,
      netWeight: netKg,
      densityFactor: effectiveDensity,
      computedQty: roundedQty,
      computedUnit: targetUnit,
    });
  };

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/50 via-white to-info/70/30 dark:from-indigo-950/20 dark:via-background dark:to-info/70/10 p-4 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-600 text-white shadow-sm">
            <Scale className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">Weighbridge Gross/Tare Calculator</h4>
            <p className="text-xs text-muted-foreground">Auto-convert vehicle weigh slips to standard volume ({targetUnit})</p>
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-xs bg-background/80">
          Net: {netKg.toLocaleString()} kg ({netMT} MT)
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-medium">Gross Weight (kg) *</Label>
          <Input
            type="number"
            placeholder="e.g. 28500"
            value={grossWeight}
            onChange={(e) => setGrossWeight(e.target.value === "" ? "" : Number(e.target.value))}
            className="h-9 mt-1 font-mono text-sm bg-background"
          />
        </div>

        <div>
          <Label className="text-xs font-medium">Tare Weight (kg) *</Label>
          <Input
            type="number"
            placeholder="e.g. 11200"
            value={tareWeight}
            onChange={(e) => setTareWeight(e.target.value === "" ? "" : Number(e.target.value))}
            className="h-9 mt-1 font-mono text-sm bg-background"
          />
        </div>

        <div>
          <Label className="text-xs font-medium">Material Density Preset</Label>
          <Select
            value={selectedPreset}
            onValueChange={(val) => {
              setSelectedPreset(val);
              const p = DENSITY_PRESETS.find((x) => x.name === val);
              if (p && p.density > 0) {
                setCustomDensity(p.density);
                if (p.unit) setTargetUnit(p.unit);
              }
            }}
          >
            <SelectTrigger className="h-9 mt-1 text-xs bg-background">
              <SelectValue placeholder="Select density preset" />
            </SelectTrigger>
            <SelectContent>
              {DENSITY_PRESETS.map((preset) => (
                <SelectItem key={preset.name} value={preset.name} className="text-xs">
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedPreset === "Custom Density" && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/50">
          <div>
            <Label className="text-xs">Custom Density (kg/m³)</Label>
            <Input
              type="number"
              value={customDensity}
              onChange={(e) => setCustomDensity(e.target.value === "" ? "" : Number(e.target.value))}
              className="h-8 mt-1 text-xs bg-background"
            />
          </div>
          <div>
            <Label className="text-xs">Target Unit</Label>
            <Input
              type="text"
              value={targetUnit}
              onChange={(e) => setTargetUnit(e.target.value)}
              className="h-8 mt-1 text-xs bg-background"
            />
          </div>
        </div>
      )}

      {/* Result Box */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-indigo-100/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
        <div className="flex items-center gap-3">
          <div className="text-center sm:text-left">
            <span className="text-xs text-muted-foreground block">Computed Inward Quantity:</span>
            <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300 font-mono">
              {roundedQty.toLocaleString()} {targetUnit}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            ({netKg.toLocaleString()} kg ÷ {effectiveDensity} kg/{targetUnit})
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={handleApply}
          disabled={netKg <= 0}
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 h-8 text-xs font-medium shrink-0 shadow-sm"
        >
          <Check className="h-3.5 w-3.5" />
          Apply to Form
        </Button>
      </div>
    </div>
  );
}
