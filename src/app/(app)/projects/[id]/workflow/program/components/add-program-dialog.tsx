"use client";

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, X, FileQuestion, ListChecks, RefreshCw, Package, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";

type SelectedItem = {
  source: string;
  rfiId?: string;
  rfiItemId?: string;
  rfiNumber?: string;
  ganttTaskId?: string;
  taskName: string;
  location?: string;
  boqItemId: string;
  boqCode?: string;
  boqDesc?: string;
  qty: number;
  unit?: string;
  paymentType: string;
  ingredients: any[];
  assignedTo?: string;
  originalTaskId?: string;
};

type AvailableRfi = {
  id: string;
  number: string;
  subject: string;
  location?: string | null;
  ganttTaskId?: string | null;
  ganttTask?: { id: string; code?: string | null; name: string } | null;
  items: Array<{
    id: string;
    boqItem?: { id: string; code: string; description: string; unit: string; ingredients: any[] } | null;
    quantity?: number | null;
    unit?: string | null;
    paymentType: string;
  }>;
};

type RfiItem = {
  id: string;
  boqItem?: { id: string; code: string; description: string; unit: string; ingredients: any[] } | null;
  quantity?: number | null;
  unit?: string | null;
  paymentType: string;
};

export function AddProgramDialog({
  projectId,
  program,
  defaultDate,
  onDone,
}: {
  projectId: string;
  program?: any;
  defaultDate?: Date;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [programDate, setProgramDate] = useState(
    format(defaultDate ?? new Date(), "yyyy-MM-dd")
  );
  const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"rfi" | "backlog">("rfi");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  // Fetch approved RFIs with items
  const { data: rfiData, isLoading: rfisLoading } = trpc.workflow.dailyProgram.listAvailableRfis.useQuery({ projectId });

  // Fetch Backlog tasks (Postponed / uncompleted tasks)
  const { data: backlogData, isLoading: backlogLoading } = trpc.workflow.dailyProgram.listBacklogTasks.useQuery({ projectId, limit: 500 });

  // Fetch BOQ items for ingredient lookup (edit mode)
  const { data: boqData } = trpc.boq.list.useQuery({ projectId });

  useEffect(() => {
    if (program && boqData?.items) {
      setProgramDate(format(new Date(program.programDate), "yyyy-MM-dd"));
      setNotes(program.notes || "");

      const mapped = program.tasks.map((task: any) => {
        const boqItem = boqData.items.find((item) => item.id === task.boqItemId);
        const ingredients = boqItem?.ingredients || [];

        let source: "rfi" | "gantt" | "manual" | "backlog" = "manual";
        if (task.rfiId) source = "rfi";
        else if (task.ganttTaskId) source = "gantt";
        else if (task.carriedOverFromId) source = "backlog";

        return {
          id: task.id,
          source,
          rfiId: task.rfiId || undefined,
          rfiItemId: task.rfiItemId || undefined,
          ganttTaskId: task.ganttTaskId || undefined,
          taskName: task.taskName,
          location: task.location || undefined,
          boqItemId: task.boqItemId || "",
          boqCode: task.boqCode || "",
          boqDesc: task.boqDesc || "",
          qty: task.plannedQty,
          unit: task.unit || "",
          paymentType: task.paymentType || "payable",
          ingredients,
          originalTaskId: task.carriedOverFromId || undefined,
        };
      });
      setSelectedItems(mapped);
    }
  }, [program, boqData]);

  // Toggle RFI item selection
  function toggleRfiItem(rfi: AvailableRfi, item: RfiItem) {
    if (!item.boqItem) return;
    const existing = selectedItems.find(
      (s) => s.source === "rfi" && s.rfiItemId === item.id
    );
    if (existing) {
      setSelectedItems(
        selectedItems.filter((s) => !(s.source === "rfi" && s.rfiItemId === item.id))
      );
    } else {
      setSelectedItems([
        ...selectedItems,
        {
          source: "rfi",
          rfiId: rfi.id,
          rfiItemId: item.id,
          rfiNumber: rfi.number,
          ganttTaskId: rfi.ganttTaskId || "",
          taskName: `${rfi.ganttTask?.code ?? ""} ${rfi.ganttTask?.name ?? rfi.subject}`.trim(),
          location: rfi.location || "",
          boqItemId: item.boqItem.id,
          boqCode: item.boqItem.code,
          boqDesc: item.boqItem.description,
          qty: item.quantity || 0,
          unit: item.unit || item.boqItem.unit,
          paymentType: item.paymentType,
          ingredients: item.boqItem.ingredients,
        },
      ]);
    }
  }

  // Toggle Backlog task selection
  function toggleBacklogItem(task: any) {
    const existing = selectedItems.find(
      (s) => s.source === "backlog" && s.taskName === task.taskName && s.location === task.location
    );
    if (existing) {
      setSelectedItems(
        selectedItems.filter(
          (s) => !(s.source === "backlog" && s.taskName === task.taskName && s.location === task.location)
        )
      );
    } else {
      setSelectedItems([
        ...selectedItems,
        {
          source: "backlog",
          rfiId: task.rfiId || "",
          rfiItemId: task.rfiItemId || "",
          rfiNumber: "",
          ganttTaskId: task.ganttTaskId || "",
          taskName: task.taskName,
          location: task.location || "",
          boqItemId: task.boqItemId || "",
          boqCode: task.boqCode || "",
          boqDesc: task.boqDesc || "",
          qty: task.plannedQty,
          unit: task.unit || "",
          paymentType: task.paymentType,
          ingredients: [],
          originalTaskId: task.id,
        },
      ]);
    }
  }

  function removeItem(idx: number) {
    setSelectedItems(selectedItems.filter((_, i) => i !== idx));
  }

  // Aggregate material requirements from all selected items
  const materialSummary = useMemo(() => {
    const map = new Map<
      string,
      { name: string; type: string; unit: string; qty: number; cost: number }
    >();
    for (const sel of selectedItems) {
      for (const ing of sel.ingredients || []) {
        const needed = ing.quantity * sel.qty;
        const cost = ing.amount * sel.qty;
        const key = `${ing.name}|${ing.unit}`;
        const existing = map.get(key);
        if (existing) {
          existing.qty += needed;
          existing.cost += cost;
        } else {
          map.set(key, {
            name: ing.name,
            type: ing.type,
            unit: ing.unit,
            qty: needed,
            cost,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [selectedItems]);

  const createMutation = trpc.workflow.dailyProgram.createProgram.useMutation({
    onSuccess: () => {
      utils.workflow.dailyProgram.listPrograms.invalidate({ projectId });
      toast.success("Daily program created");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.workflow.dailyProgram.updateProgram.useMutation({
    onSuccess: () => {
      utils.workflow.dailyProgram.listPrograms.invalidate({ projectId });
      toast.success("Daily program updated");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = () => {
    const tasks = selectedItems.map((s) => ({
      rfiId: s.rfiId || null,
      rfiItemId: s.rfiItemId || null,
      ganttTaskId: s.ganttTaskId || null,
      taskName: s.taskName,
      location: s.location || undefined,
      boqItemId: s.boqItemId,
      boqCode: s.boqCode,
      boqDesc: s.boqDesc,
      plannedQty: s.qty,
      unit: s.unit,
      paymentType: s.paymentType as any,
      assignedTo: s.assignedTo || undefined,
      carriedOverFromId: s.originalTaskId || undefined,
    }));

    if (program) {
      updateMutation.mutate({
        programId: program.id,
        projectId,
        programDate: new Date(programDate).toISOString(),
        notes: notes || undefined,
        tasks,
      });
    } else {
      createMutation.mutate({
        projectId,
        programDate: new Date(programDate).toISOString(),
        notes: notes || undefined,
        tasks,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  function resyncFromRfi() {
    if (!rfiData?.rfis?.length) {
      toast.info("No approved RFIs to sync from");
      return;
    }
    const rfiItems: SelectedItem[] = [];
    for (const rfi of rfiData.rfis) {
      for (const item of rfi.items) {
        if (!item.boqItem) continue;
        rfiItems.push({
          source: "rfi",
          rfiId: rfi.id,
          rfiItemId: item.id,
          rfiNumber: rfi.number,
          ganttTaskId: rfi.ganttTaskId || "",
          taskName: `${rfi.ganttTask?.code ?? ""} ${rfi.ganttTask?.name ?? rfi.subject}`.trim(),
          location: rfi.location || "",
          boqItemId: item.boqItem.id,
          boqCode: item.boqItem.code,
          boqDesc: item.boqItem.description,
          qty: item.quantity || 0,
          unit: item.unit || item.boqItem.unit,
          paymentType: item.paymentType,
          ingredients: item.boqItem.ingredients,
        });
      }
    }
    const nonRfi = selectedItems.filter((s) => s.source !== "rfi");
    setSelectedItems([...nonRfi, ...rfiItems]);
    toast.success(`Synced ${rfiItems.length} item${rfiItems.length > 1 ? "s" : ""} from approved RFIs`);
  }

  return (
    <DialogContent className="sm:max-w-5xl w-[94vw] aspect-[16/10] max-h-[90vh] p-0 overflow-hidden font-mono bg-card border border-border text-foreground shadow-2xl rounded-2xl flex flex-col">
      <DialogHeader className="px-6 py-3.5 border-b border-border bg-muted/20 shrink-0">
        <DialogTitle className="text-sm font-bold text-primary uppercase tracking-wide">
          {program ? "Edit Daily Program" : "Create Daily Program"}
        </DialogTitle>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start text-xs">
        {/* Left Column: Date, Notes & Source Picker */}
        <div className="space-y-3">
          {/* Date and General Notes */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase">Program Date *</Label>
              <NepaliDatePicker
                value={programDate}
                onChange={(_, dateStr) => setProgramDate(dateStr)}
                className="h-8 text-xs font-mono bg-background border-border/80"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase">Site Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Site weather, work shift, or general notes…"
                className="h-8 text-xs font-mono bg-background border-border/80"
              />
            </div>
          </div>

          {/* Source Tabs & RFI Resync */}
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="h-7 bg-muted/40 p-0.5 border border-border/60">
                <TabsTrigger value="rfi" className="text-[11px] font-mono h-6 px-2.5 gap-1.5">
                  <FileQuestion className="h-3 w-3" /> Approved RFIs
                  {selectedItems.filter((s) => s.source === "rfi").length > 0 && (
                    <span className="px-1 rounded bg-primary text-primary-foreground font-bold text-[9px]">
                      {selectedItems.filter((s) => s.source === "rfi").length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="backlog" className="text-[11px] font-mono h-6 px-2.5 gap-1.5">
                  <ListChecks className="h-3 w-3" /> Backlog
                  {selectedItems.filter((s) => s.source === "backlog").length > 0 && (
                    <span className="px-1 rounded bg-amber-500 text-black font-bold text-[9px]">
                      {selectedItems.filter((s) => s.source === "backlog").length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs font-mono border-border/80 gap-1"
              onClick={resyncFromRfi}
              title="Re-sync all items from approved RFIs"
            >
              <RefreshCw className="h-3 w-3" /> Auto-Sync RFIs
            </Button>
          </div>

          {/* Tab 1: From Approved RFIs */}
          {activeTab === "rfi" && (
            <div>
              {rfisLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !rfiData?.rfis?.length ? (
                <div className="rounded border border-dashed border-border/80 p-4 text-center text-xs text-muted-foreground">
                  No approved RFIs with work items found.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
                  {rfiData.rfis.map((rfi) => (
                    <div key={rfi.id} className="rounded border border-border/80 bg-background/50 p-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono font-bold text-primary">{rfi.number}</span>
                          <span className="truncate font-medium text-foreground">{rfi.subject}</span>
                        </div>
                        {rfi.location && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                            <MapPin className="h-2.5 w-2.5" /> {rfi.location}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {rfi.items.map((item) => {
                          const isSelected = selectedItems.some(
                            (s) => s.source === "rfi" && s.rfiItemId === item.id
                          );
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleRfiItem(rfi, item)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-xs transition-colors",
                                isSelected
                                  ? "bg-primary/10 border-primary/40 text-foreground"
                                  : "bg-card border-border/60 hover:bg-muted/30 text-muted-foreground"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="h-3.5 w-3.5 rounded border-border"
                              />
                              {item.boqItem && (
                                <>
                                  <span className="font-bold text-primary shrink-0">{item.boqItem.code}</span>
                                  <span className="truncate flex-1">{item.boqItem.description}</span>
                                  <span className="font-bold tabular-nums shrink-0">{item.quantity} {item.unit}</span>
                                  <span className="px-1 py-0.5 rounded border border-border text-[9px] uppercase font-bold shrink-0">
                                    {item.paymentType}
                                  </span>
                                </>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Backlog */}
          {activeTab === "backlog" && (
            <div>
              {backlogLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !backlogData?.backlogTasks?.length ? (
                <div className="rounded border border-dashed border-border/80 p-4 text-center text-xs text-muted-foreground">
                  No uncompleted tasks in backlog.
                </div>
              ) : (
                <div className="rounded border border-border/80 overflow-hidden max-h-60 overflow-y-auto no-scrollbar">
                  <table className="w-full text-xs tabular-nums font-mono">
                    <thead className="bg-muted/60 border-b border-border/60">
                      <tr className="text-left text-muted-foreground text-[10px] uppercase">
                        <th className="w-7 py-1 px-1 text-center"></th>
                        <th className="py-1 px-2">Task</th>
                        <th className="py-1 px-2">Location</th>
                        <th className="py-1 px-2 text-right">Remaining Qty</th>
                        <th className="py-1 px-2 text-center">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {backlogData.backlogTasks.map((task) => {
                        const isSelected = selectedItems.some(
                          (s) => s.source === "backlog" && s.taskName === task.taskName && s.location === task.location
                        );
                        return (
                          <tr
                            key={task.id}
                            className={cn("hover:bg-primary/5 cursor-pointer", isSelected && "bg-primary/10")}
                            onClick={() => toggleBacklogItem(task)}
                          >
                            <td className="py-1 px-1 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="h-3.5 w-3.5 rounded border-border"
                              />
                            </td>
                            <td className="py-1 px-2">
                              <div className="font-medium text-foreground">{task.taskName}</div>
                              {task.boqCode && (
                                <div className="text-[10px] text-muted-foreground font-mono">BOQ: {task.boqCode}</div>
                              )}
                            </td>
                            <td className="py-1 px-2 text-muted-foreground">{task.location || "—"}</td>
                            <td className="py-1 px-2 text-right font-bold text-amber-400">
                              {task.plannedQty} {task.unit}
                            </td>
                            <td className="py-1 px-2 text-center">
                              <span className="px-1 py-0.5 rounded border border-border text-[9px] uppercase font-bold">
                                {task.paymentType}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Selected Items List & Ingredients Summary */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-1">
            <span className="text-[10px] font-bold uppercase text-primary tracking-wider">
              Selected Work Items ({selectedItems.length})
            </span>
            <span className="text-[11px] text-muted-foreground">
              {selectedItems.length === 0 ? "None selected" : `${selectedItems.length} active`}
            </span>
          </div>

          {selectedItems.length === 0 ? (
            <div className="p-8 border border-dashed border-border/80 rounded bg-background/40 text-center text-xs text-muted-foreground">
              Select items from Approved RFIs or Backlog on the left to include in this daily program.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto no-scrollbar">
              {selectedItems.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="px-1 py-0.5 rounded border border-border/80 text-[9px] uppercase font-bold text-muted-foreground bg-muted/40 shrink-0">
                      {s.source === "rfi" ? `RFI ${s.rfiNumber}` : s.source}
                    </span>
                    <span className="truncate font-medium text-foreground">{s.taskName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-primary">{s.qty} {s.unit}</span>
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="text-muted-foreground hover:text-destructive p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="gap-2 border-t border-border px-6 py-3 shrink-0 bg-muted/20">
        <span className="text-xs text-muted-foreground mr-auto">
          {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""} selected
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs font-mono" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onSubmit}
          disabled={isPending || selectedItems.length === 0}
        >
          {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {program ? "Save Changes" : "Create Daily Program"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
