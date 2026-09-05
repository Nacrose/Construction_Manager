"use client";

import { UseFormReturn, useWatch } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";
import { DrawingPinSelector } from "./drawing-pin-selector";

export function RfiEngineeringSection({
  form,
  ganttTasks,
  drawingsData,
  membersData,
  subcontractorsData,
}: {
  form: UseFormReturn<any>;
  ganttTasks: any;
  drawingsData: any;
  membersData: any;
  subcontractorsData: any;
}) {
  const ganttTaskId = useWatch({ control: form.control, name: "ganttTaskId" }) ?? "";
  const drawingId = useWatch({ control: form.control, name: "drawingId" }) ?? "";
  const subcontractorId = useWatch({ control: form.control, name: "subcontractorId" }) ?? "";
  const assignedToId = useWatch({ control: form.control, name: "assignedToId" }) ?? "";
  const pinX = useWatch({ control: form.control, name: "pinX" }) ?? null;
  const pinY = useWatch({ control: form.control, name: "pinY" }) ?? null;

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-primary border-b border-border/40 pb-1">
        Engineering Linkages &amp; Schedule
      </div>

      {/* Linked Gantt Task & Assignee */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="r-task" className="text-xs">
            Linked Gantt Task
          </Label>
          <Select
            value={ganttTaskId || "none"}
            onValueChange={(v) => form.setValue("ganttTaskId", v === "none" ? "" : v)}
          >
            <SelectTrigger
              id="r-task"
              className="h-8 text-xs bg-background border-border/80 truncate"
            >
              <SelectValue placeholder="— None —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {ganttTasks?.tasks.map((t: any) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.code ?? "?"} · {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="r-assignee" className="text-xs">
            Assigned To
          </Label>
          <Select
            value={assignedToId || "auto"}
            onValueChange={(v) => form.setValue("assignedToId", v === "auto" ? "" : v)}
          >
            <SelectTrigger
              id="r-assignee"
              className="h-8 text-xs bg-background border-border/80 truncate"
            >
              <SelectValue placeholder="— Auto —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">— Auto (by role) —</SelectItem>
              {membersData?.members.map((m: any) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.user.name} ({m.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Drawing Reference & Pin */}
      <div className="space-y-1.5">
        <Label htmlFor="r-drawing" className="text-xs">
          Drawing Reference
        </Label>
        <Select
          value={drawingId || "none"}
          onValueChange={(v) => {
            form.setValue("drawingId", v === "none" ? "" : v);
            form.setValue("pinX", null);
            form.setValue("pinY", null);
          }}
        >
          <SelectTrigger
            id="r-drawing"
            className="h-8 text-xs bg-background border-border/80 truncate"
          >
            <SelectValue placeholder="— None —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {drawingsData?.drawings.map((d: any) => (
              <SelectItem key={d.id} value={d.id} className="text-xs">
                {d.number} Rev {d.revision} · {d.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {drawingId && (
          <DrawingPinSelector
            drawingId={drawingId}
            pinX={pinX}
            pinY={pinY}
            onPinChange={(x, y) => {
              form.setValue("pinX", x);
              form.setValue("pinY", y);
            }}
          />
        )}
      </div>

      {/* Inspection Window */}
      <div className="space-y-1.5 pt-1">
        <Label className="text-xs flex items-center gap-1">
          <Clock className="h-3 w-3 text-muted-foreground" />
          Work Date & Inspection Window
        </Label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className="text-[10px] text-muted-foreground block mb-0.5">
              Date (नेपाली / BS)
            </span>
            <NepaliDatePicker
              value={form.watch("workDate")}
              onChange={(_, dateStr) =>
                form.setValue("workDate", dateStr, { shouldValidate: true })
              }
              className="h-8 text-xs bg-background border-border/80"
            />
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground block mb-0.5">Start Time</span>
            <Input
              type="time"
              {...form.register("inspectionStartTime")}
              className="h-8 text-xs bg-background border-border/80"
            />
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground block mb-0.5">End Time</span>
            <Input
              type="time"
              {...form.register("inspectionEndTime")}
              className="h-8 text-xs bg-background border-border/80"
            />
          </div>
        </div>
      </div>

      {/* Impact Switches & Subcontractor */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/60">
        <div className="flex items-center justify-between p-2 rounded border border-border/60 bg-background/60">
          <span className="text-xs">Cost Impact</span>
          <Switch
            checked={useWatch({ control: form.control, name: "costImpact" })}
            onCheckedChange={(checked) => form.setValue("costImpact", checked)}
          />
        </div>
        <div className="flex items-center justify-between p-2 rounded border border-border/60 bg-background/60">
          <span className="text-xs">Schedule Impact</span>
          <Switch
            checked={useWatch({ control: form.control, name: "scheduleImpact" })}
            onCheckedChange={(checked) => form.setValue("scheduleImpact", checked)}
          />
        </div>
      </div>

      {/* Optional Subcontractor */}
      {subcontractorsData?.subcontractors && subcontractorsData.subcontractors.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="r-subcontractor" className="text-xs">
            Subcontractor (optional)
          </Label>
          <Select
            value={subcontractorId || "none"}
            onValueChange={(v) => form.setValue("subcontractorId", v === "none" ? "" : v)}
          >
            <SelectTrigger id="r-subcontractor" className="h-8 text-xs bg-background border-border/80">
              <SelectValue placeholder="— None —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {subcontractorsData.subcontractors
                .filter((s: any) => s.status === "active")
                .map((s: any) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
