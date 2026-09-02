"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileDropzone, AttachmentBadge } from "@/components/workflow/file-dropzone";
import {
  Loader2, Check, X, Plus, Send, MapPin, FileQuestion,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";
import type { RfiDetail } from "@/components/workflow/rfi-types";
export function EditRfiDialog({
  rfiId,
  projectId,
  rfi,
  onDone,
}: {
  rfiId: string;
  projectId: string;
  rfi: RfiDetail;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: ganttTasks } = trpc.gantt.list.useQuery({ projectId });
  const { data: boqData } = trpc.boq.list.useQuery({ projectId });
  const { data: drawingsData } = trpc.document.listDrawings.useQuery({ projectId, limit: 500 });
  const { data: subcontractorsData } = trpc.partner.listSubcontractors.useQuery({ projectId, limit: 500 });

  const [items, setItems] = useState<{ boqItemId: string; quantity: string; paymentType: "payable" | "unpayable" | "temporary" }[]>(() => {
    return (rfi.items || []).map((it) => ({
      boqItemId: it.boqItemId || "",
      quantity: it.quantity ? String(it.quantity) : "",
      paymentType: (it.paymentType as any) || "payable",
    }));
  });

  function addItem() {
    setItems([...items, { boqItemId: "", quantity: "", paymentType: "payable" }]);
  }
  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }
  function updateItem(idx: number, field: "boqItemId" | "quantity" | "paymentType", value: string) {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  const form = useForm({
    defaultValues: {
      subject: rfi.subject,
      description: rfi.description,
      priority: rfi.priority,
      discipline: rfi.discipline ?? "none",
      workDate: rfi.workDate ? format(new Date(rfi.workDate), "yyyy-MM-dd") : "",
      inspectionStartTime: rfi.inspectionStartTime ? format(new Date(rfi.inspectionStartTime), "HH:mm") : "",
      inspectionEndTime: rfi.inspectionEndTime ? format(new Date(rfi.inspectionEndTime), "HH:mm") : "",
      location: rfi.location ?? "",
      ganttTaskId: rfi.ganttTaskId ?? "",
      boqItemId: rfi.boqItemId ?? "",
      drawingId: rfi.drawingId ?? "",
      subcontractorId: rfi.subcontractorId ?? "",
      costImpact: rfi.costImpact ?? false,
      scheduleImpact: rfi.scheduleImpact ?? false,
    },
  });

  const editPriority = useWatch({ control: form.control, name: "priority" });
  const editDiscipline = useWatch({ control: form.control, name: "discipline" });
  const editGanttTaskId = useWatch({ control: form.control, name: "ganttTaskId" }) ?? "";
  const editBoqItemId = useWatch({ control: form.control, name: "boqItemId" }) ?? "";
  const editDrawingId = useWatch({ control: form.control, name: "drawingId" }) ?? "";
  const editSubcontractorId = useWatch({ control: form.control, name: "subcontractorId" }) ?? "";

  const prevTaskIdRef = useRef<string>("");
  useEffect(() => {
    const taskId = editGanttTaskId;
    if (taskId && taskId !== prevTaskIdRef.current) {
      prevTaskIdRef.current = taskId;
      const task = ganttTasks?.tasks.find((t) => t.id === taskId) as any;
      if (task?.boqLinks?.length > 0) {
        const preloaded = task.boqLinks.map((link: any) => ({
          boqItemId: link.boqItem.id,
          quantity: "",
          paymentType: "payable" as const,
        }));
        const existingIds = new Set(items.map((it) => it.boqItemId));
        const newItems = preloaded.filter((it: any) => !existingIds.has(it.boqItemId));
        if (newItems.length > 0) {
          setItems([...items, ...newItems]);
          toast.success(`Pre-filled ${newItems.length} BOQ item${newItems.length > 1 ? "s" : ""} from task`);
        }
      }
    }
    if (!taskId) {
      prevTaskIdRef.current = "";
    }
  }, [editGanttTaskId, ganttTasks, projectId]);

  const mutation = trpc.workflow.rfi.update.useMutation({
    onSuccess: () => {
      utils.workflow.rfi.get.invalidate({ id: rfiId });
      utils.workflow.rfi.list.invalidate({ projectId });
      toast.success("RFI updated");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (values: any) => {
    const rfiItems = items
      .filter((it) => it.boqItemId)
      .map((it) => {
        const boq = boqData?.items.find((b) => b.id === it.boqItemId);
        return {
          boqItemId: it.boqItemId,
          boqCode: boq?.code ?? "",
          boqDesc: boq?.description ?? "",
          quantity: parseFloat(it.quantity) || 0,
          unit: boq?.unit ?? "",
          paymentType: it.paymentType,
        };
      });

    mutation.mutate({
      id: rfiId,
      subject: values.subject,
      description: values.description,
      priority: values.priority,
      discipline: values.discipline !== "none" ? values.discipline : null,
      workDate: values.workDate ? new Date(values.workDate).toISOString() : null,
      inspectionStartTime: values.inspectionStartTime ? new Date(`${format(new Date(), "yyyy-MM-dd")}T${values.inspectionStartTime}`).toISOString() : null,
      inspectionEndTime: values.inspectionEndTime ? new Date(`${format(new Date(), "yyyy-MM-dd")}T${values.inspectionEndTime}`).toISOString() : null,
      location: values.location || null,
      ganttTaskId: values.ganttTaskId || null,
      boqItemId: values.boqItemId || null,
      drawingId: values.drawingId || null,
      subcontractorId: values.subcontractorId || null,
      costImpact: values.costImpact,
      scheduleImpact: values.scheduleImpact,
      items: rfiItems,
    });
  };

  return (
    <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto p-6 bg-background rounded-xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
          <FileQuestion className="h-5 w-5" /> Edit RFI · {rfi.number}
        </h3>
      </div>
      
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-1.5">
          <Label className="font-semibold text-sm">Title <span className="text-red-500">*</span></Label>
          <Input {...form.register("subject")} className="bg-background" />
        </div>

        <div className="space-y-1.5">
          <Label className="font-semibold text-sm">Detailed Description <span className="text-red-500">*</span></Label>
          <Textarea rows={4} {...form.register("description")} className="resize-none bg-background" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Category <span className="text-red-500">*</span></Label>
            <Select value={editDiscipline} onValueChange={(v) => form.setValue("discipline", v as never)}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {["civil", "structural", "electrical", "mechanical", "architectural"].map((d) => (
                  <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Priority <span className="text-red-500">*</span></Label>
            <Select value={editPriority} onValueChange={(v) => form.setValue("priority", v as never)}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["low", "normal", "high", "urgent"].map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-semibold text-sm">Working Location / Area</Label>
          <Input {...form.register("location")} placeholder="e.g. Chainage 0+500, Grid A-3..." className="bg-background" />
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-3 w-3" /> Where on site does this RFI apply to?
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Work Date (नेपाली / BS)</Label>
            <NepaliDatePicker
              value={form.watch("workDate")}
              onChange={(_, dateStr) => form.setValue("workDate", dateStr, { shouldValidate: true })}
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Inspection Start</Label>
            <Input type="time" {...form.register("inspectionStartTime")} className="bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Inspection End</Label>
            <Input type="time" {...form.register("inspectionEndTime")} className="bg-background" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-2 border-t">
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Linked Gantt task</Label>
            <Select value={editGanttTaskId || "none"} onValueChange={(v) => form.setValue("ganttTaskId", v === "none" ? "" : v)}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="— None —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {ganttTasks?.tasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.code ?? "?"} · {t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Linked BOQ Item</Label>
            <Select value={editBoqItemId || "none"} onValueChange={(v) => form.setValue("boqItemId", v === "none" ? "" : v)}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="— None —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {boqData?.items.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.code} · {b.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Drawing reference</Label>
            <Select value={editDrawingId || "none"} onValueChange={(v) => form.setValue("drawingId", v === "none" ? "" : v)}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="— None —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {drawingsData?.drawings.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.number} Rev {d.revision} · {d.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold text-sm">Subcontractor</Label>
            <Select value={editSubcontractorId || "none"} onValueChange={(v) => form.setValue("subcontractorId", v === "none" ? "" : v)}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="— None —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {subcontractorsData?.subcontractors.filter(s => s.status === "active").map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}{s.contact ? ` · ${s.contact}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-6 items-center p-3 bg-muted/30 rounded-md border">
          <div className="flex items-center space-x-2">
            <Switch
              id="edit-cost-impact"
              checked={useWatch({ control: form.control, name: "costImpact" })}
              onCheckedChange={(checked) => form.setValue("costImpact", checked)}
            />
            <Label htmlFor="edit-cost-impact" className="font-semibold text-sm">Cost Impact Expected</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="edit-schedule-impact"
              checked={useWatch({ control: form.control, name: "scheduleImpact" })}
              onCheckedChange={(checked) => form.setValue("scheduleImpact", checked)}
            />
            <Label htmlFor="edit-schedule-impact" className="font-semibold text-sm">Schedule Impact Expected</Label>
          </div>
        </div>

        {/* RFI line items */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between">
            <Label className="font-semibold text-sm">Material Requirements (Quantities & BOQ)</Label>
            <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-7 text-xs">
              <Plus className="mr-1 h-3 w-3" /> Add item
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 bg-muted/30 border border-dashed rounded text-center">
              No materials or work items. Select a Gantt task to auto-fill, or add manually.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {items.map((it, idx) => {
                const boq = boqData?.items.find((b) => b.id === it.boqItemId);
                return (
                  <div key={idx} className="grid grid-cols-[1fr_5rem_3rem_7rem_7rem_1.5rem] gap-2 items-center">
                    <Select value={it.boqItemId} onValueChange={(v) => updateItem(idx, "boqItemId", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select BOQ item" /></SelectTrigger>
                      <SelectContent>
                        {boqData?.items.map((b) => (
                          <SelectItem key={b.id} value={b.id} className="text-xs">{b.code} · {b.description} ({b.unit})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} placeholder="Qty" className="h-8 text-xs text-right" disabled={!it.boqItemId} />
                    <span className="text-xs text-muted-foreground text-center">{boq?.unit ?? ""}</span>
                    <Select value={it.paymentType} onValueChange={(v) => updateItem(idx, "paymentType", v as "payable" | "unpayable" | "temporary")}>
                      <SelectTrigger className={cn("h-8 text-[10px] font-medium", it.paymentType === "payable" && "text-emerald-700 dark:text-emerald-400", it.paymentType === "unpayable" && "text-red-700 dark:text-red-400", it.paymentType === "temporary" && "text-amber-700 dark:text-amber-400")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="payable" className="text-xs">Payable</SelectItem>
                        <SelectItem value="unpayable" className="text-xs">Unpayable</SelectItem>
                        <SelectItem value="temporary" className="text-xs">Temporary</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 text-right">{boq && it.quantity ? `NPR ${((parseFloat(it.quantity) || 0) * boq.rate).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : ""}</span>
                    <button type="button" onClick={() => removeItem(idx)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t border-border mt-6">
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending} className="bg-info hover:bg-info text-white">
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} 
            Update
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

