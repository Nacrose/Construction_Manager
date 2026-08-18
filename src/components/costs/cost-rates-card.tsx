"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_COST_RATES } from "@/lib/cost-rates";

interface ProjectRateFields {
  skilledWageRate?: number | null;
  unskilledWageRate?: number | null;
  supervisorWageRate?: number | null;
  ownedEquipRate?: number | null;
  hiredEquipRate?: number | null;
  fuelPricePerLiter?: number | null;
}

interface CostRatesCardProps {
  projectId: string;
  project: ProjectRateFields;
  canEdit: boolean;
}

/**
 * CostRatesCard — let PMs configure per-project wage and equipment rate
 * overrides. Empty fields = use the global default (shown as placeholder).
 */
export function CostRatesCard({ projectId, project, canEdit }: CostRatesCardProps) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Local form state — empty string means "use default"
  const [skilledWageRate, setSkilledWageRate] = useState("");
  const [unskilledWageRate, setUnskilledWageRate] = useState("");
  const [supervisorWageRate, setSupervisorWageRate] = useState("");
  const [ownedEquipRate, setOwnedEquipRate] = useState("");
  const [hiredEquipRate, setHiredEquipRate] = useState("");
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState("");

  // Sync from project when entering edit mode
  useEffect(() => {
    if (editing) {
      setSkilledWageRate(project.skilledWageRate?.toString() ?? "");
      setUnskilledWageRate(project.unskilledWageRate?.toString() ?? "");
      setSupervisorWageRate(project.supervisorWageRate?.toString() ?? "");
      setOwnedEquipRate(project.ownedEquipRate?.toString() ?? "");
      setHiredEquipRate(project.hiredEquipRate?.toString() ?? "");
      setFuelPricePerLiter(project.fuelPricePerLiter?.toString() ?? "");
    }
  }, [editing, project]);

  const updateMut = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.get.invalidate({ id: projectId });
      setSaving(false);
      setEditing(false);
      toast.success("Cost rates updated");
    },
    onError: (e) => {
      setSaving(false);
      toast.error(e.message);
    },
  });

  function handleSave() {
    setSaving(true);
    // Empty string → null (use default)
    const parse = (v: string) => (v.trim() === "" ? null : parseFloat(v));
    updateMut.mutate({
      id: projectId,
      skilledWageRate: parse(skilledWageRate),
      unskilledWageRate: parse(unskilledWageRate),
      supervisorWageRate: parse(supervisorWageRate),
      ownedEquipRate: parse(ownedEquipRate),
      hiredEquipRate: parse(hiredEquipRate),
      fuelPricePerLiter: parse(fuelPricePerLiter),
    });
  }

  function handleReset() {
    setSkilledWageRate("");
    setUnskilledWageRate("");
    setSupervisorWageRate("");
    setOwnedEquipRate("");
    setHiredEquipRate("");
    setFuelPricePerLiter("");
  }

  const fmtDefault = (n: number) => `Default: NPR ${n}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4" />
            Cost Rates
          </CardTitle>
          <CardDescription className="text-xs">
            Override default wage and equipment rates for this project. Empty = use global default.
          </CardDescription>
        </div>
        {canEdit && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Labor section */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Labor Wages (NPR/day)</p>
          <div className="grid grid-cols-3 gap-3">
            <RateField
              label="Skilled"
              value={editing ? skilledWageRate : (project.skilledWageRate ?? "").toString()}
              onChange={setSkilledWageRate}
              placeholder={fmtDefault(DEFAULT_COST_RATES.labor.skilledDailyWage)}
              editing={editing}
              effective={project.skilledWageRate ?? DEFAULT_COST_RATES.labor.skilledDailyWage}
            />
            <RateField
              label="Unskilled"
              value={editing ? unskilledWageRate : (project.unskilledWageRate ?? "").toString()}
              onChange={setUnskilledWageRate}
              placeholder={fmtDefault(DEFAULT_COST_RATES.labor.unskilledDailyWage)}
              editing={editing}
              effective={project.unskilledWageRate ?? DEFAULT_COST_RATES.labor.unskilledDailyWage}
            />
            <RateField
              label="Supervisor"
              value={editing ? supervisorWageRate : (project.supervisorWageRate ?? "").toString()}
              onChange={setSupervisorWageRate}
              placeholder={fmtDefault(DEFAULT_COST_RATES.labor.supervisorDailyWage)}
              editing={editing}
              effective={project.supervisorWageRate ?? DEFAULT_COST_RATES.labor.supervisorDailyWage}
            />
          </div>
        </div>

        {/* Equipment section */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Equipment Rates (NPR/hr)</p>
          <div className="grid grid-cols-2 gap-3">
            <RateField
              label="Owned"
              value={editing ? ownedEquipRate : (project.ownedEquipRate ?? "").toString()}
              onChange={setOwnedEquipRate}
              placeholder={fmtDefault(DEFAULT_COST_RATES.equipment.ownedHourlyRate)}
              editing={editing}
              effective={project.ownedEquipRate ?? DEFAULT_COST_RATES.equipment.ownedHourlyRate}
            />
            <RateField
              label="Hired"
              value={editing ? hiredEquipRate : (project.hiredEquipRate ?? "").toString()}
              onChange={setHiredEquipRate}
              placeholder={fmtDefault(DEFAULT_COST_RATES.equipment.hiredHourlyRate)}
              editing={editing}
              effective={project.hiredEquipRate ?? DEFAULT_COST_RATES.equipment.hiredHourlyRate}
            />
          </div>
        </div>

        {/* Fuel section */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Fuel (NPR/liter)</p>
          <div className="grid grid-cols-2 gap-3">
            <RateField
              label="Diesel"
              value={editing ? fuelPricePerLiter : (project.fuelPricePerLiter ?? "").toString()}
              onChange={setFuelPricePerLiter}
              placeholder={fmtDefault(DEFAULT_COST_RATES.equipment.fuelPricePerLiter)}
              editing={editing}
              effective={project.fuelPricePerLiter ?? DEFAULT_COST_RATES.equipment.fuelPricePerLiter}
            />
          </div>
        </div>

        {/* Save / Cancel buttons */}
        {editing && (
          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <Button size="sm" variant="ghost" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset to defaults
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * RateField — single rate input. In view mode, shows the effective value
 * with a small "default" badge if no override is set. In edit mode, shows
 * an input with the default as placeholder.
 */
function RateField({
  label,
  value,
  onChange,
  placeholder,
  editing,
  effective,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  editing: boolean;
  effective: number;
}) {
  const isOverridden = value !== "";
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center justify-between">
        <span>{label}</span>
        {isOverridden && (
          <span className="rounded bg-amber-500/15 px-1 text-[9px] text-amber-700 dark:text-amber-400">
            custom
          </span>
        )}
      </Label>
      {editing ? (
        <Input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
      ) : (
        <div className="rounded border bg-muted/30 px-2 py-1.5 text-sm font-mono">
          NPR {effective.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          {!isOverridden && (
            <span className="ml-1 text-[10px] text-muted-foreground">(default)</span>
          )}
        </div>
      )}
    </div>
  );
}
