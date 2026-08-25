"use client";

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
import { CloudSun, Loader2, RefreshCw } from "lucide-react";

const WEATHER_OPTIONS = ["clear", "cloudy", "overcast", "rain", "fog", "storm"];

export function WeatherSection({
  report,
  canEdit,
  weatherNonce,
  fetchingWeather,
  onFetchWeather,
  saveField,
}: {
  report: any;
  canEdit: boolean;
  weatherNonce: number;
  fetchingWeather: boolean;
  onFetchWeather: () => void;
  saveField: (field: string, val: any) => void | Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CloudSun className="h-4 w-4 text-emerald-600" /> Weather & Site Conditions
        </h3>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={onFetchWeather}
            disabled={fetchingWeather}
          >
            {fetchingWeather ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Auto-Fetch Weather
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(["weatherMorning", "weatherAfternoon", "weatherEvening"] as const).map((field) => (
          <div key={field} className="space-y-1">
            <Label className="text-xs capitalize">{field.replace("weather", "")} Condition</Label>
            <Select
              key={`${field}-${weatherNonce}`}
              disabled={!canEdit}
              defaultValue={report[field] || undefined}
              onValueChange={(val) => saveField(field, val)}
            >
              <SelectTrigger className="h-8 text-xs capitalize">
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
                {WEATHER_OPTIONS.map((w) => (
                  <SelectItem key={w} value={w} className="capitalize text-xs">
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Max Temp (°C)</Label>
          <Input
            disabled={!canEdit}
            type="number"
            step="0.1"
            className="h-8 text-xs"
            defaultValue={report.maxTempC ?? ""}
            onBlur={(e) =>
              saveField("maxTempC", e.target.value ? parseFloat(e.target.value) : undefined)
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Min Temp (°C)</Label>
          <Input
            disabled={!canEdit}
            type="number"
            step="0.1"
            className="h-8 text-xs"
            defaultValue={report.minTempC ?? ""}
            onBlur={(e) =>
              saveField("minTempC", e.target.value ? parseFloat(e.target.value) : undefined)
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Rainfall (mm)</Label>
          <Input
            disabled={!canEdit}
            type="number"
            step="0.1"
            className="h-8 text-xs"
            defaultValue={report.rainfallMm ?? ""}
            onBlur={(e) =>
              saveField("rainfallMm", e.target.value ? parseFloat(e.target.value) : undefined)
            }
          />
        </div>
      </div>
    </div>
  );
}
