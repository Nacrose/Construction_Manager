"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileQuestion, Loader2, MapPin, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileDropzone, AttachmentBadge } from "./file-dropzone";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KbSuggestions } from "./kb-suggestions";
import { RfiEngineeringSection } from "./rfi-engineering-section";
import { RfiLinkedBoqSection } from "./rfi-linked-boq-section";

const CreateRfiSchema = z.object({
  number: z.string().min(1).max(50),
  subject: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  location: z.string().max(500).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  discipline: z
    .enum(["civil", "structural", "electrical", "mechanical", "architectural", "none"])
    .optional(),
  workDate: z.string().optional(),
  inspectionStartTime: z.string().optional(),
  inspectionEndTime: z.string().optional(),
  ganttTaskId: z.string().optional(),
  drawingId: z.string().optional(),
  boqItemId: z.string().optional(),
  subcontractorId: z.string().optional(),
  assignedToId: z.string().optional(),
  pinX: z.number().nullable().optional(),
  pinY: z.number().nullable().optional(),
  costImpact: z.boolean().optional(),
  scheduleImpact: z.boolean().optional(),
});

type CreateRfiValues = z.infer<typeof CreateRfiSchema>;

const DISCIPLINES = [
  { id: "civil", label: "Civil" },
  { id: "structural", label: "Structural" },
  { id: "electrical", label: "Electrical" },
  { id: "mechanical", label: "Mechanical" },
  { id: "architectural", label: "Architectural" },
  { id: "none", label: "General" },
] as const;

export function CreateRfiDialog({
  projectId,
  existingCount: _existingCount,
  defaultGanttTaskId,
  onCreated,
  onCancel,
}: {
  projectId: string;
  existingCount: number;
  defaultGanttTaskId?: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const dateStr = format(new Date(), "yyyyMMdd");
  const { data: countData } = trpc.workflow.rfi.countAll.useQuery({ projectId, dateStr });

  const dailyCount = countData?.count ?? 0;
  const defaultNumber = `RFI-${dateStr}-${String(dailyCount + 1).padStart(3, "0")}`;

  const { data: ganttTasks } = trpc.gantt.list.useQuery({ projectId });
  const { data: boqData } = trpc.boq.list.useQuery({ projectId });
  const { data: drawingsData } = trpc.document.listDrawings.useQuery({ projectId, limit: 500 });
  const { data: membersData } = trpc.workflow.rfi.assignableMembers.useQuery({ projectId });
  const { data: subcontractorsData } = trpc.partner.listSubcontractors.useQuery({ projectId, limit: 500 });

  const [items, setItems] = useState<
    {
      boqItemId: string;
      quantity: string;
      paymentType: "payable" | "unpayable" | "temporary";
    }[]
  >([]);
  const [attachFiles, setAttachFiles] = useState<
    Array<{ fileName: string; fileType: string; fileSize: number; data: string }>
  >([]);
  const [attachUploading] = useState(false);

  function addItem() {
    setItems([...items, { boqItemId: "", quantity: "", paymentType: "payable" }]);
  }
  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }
  function updateItem(
    idx: number,
    field: "boqItemId" | "quantity" | "paymentType",
    value: string
  ) {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  const [defaultWorkDate] = useState(() => format(addDays(new Date(), 1), "yyyy-MM-dd"));

  const form = useForm<CreateRfiValues>({
    resolver: zodResolver(CreateRfiSchema),
    defaultValues: {
      number: defaultNumber,
      subject: "",
      description: "",
      location: "",
      priority: "normal",
      discipline: "none",
      workDate: defaultWorkDate,
      inspectionStartTime: "",
      inspectionEndTime: "",
      ganttTaskId: defaultGanttTaskId ?? "",
      drawingId: "",
      subcontractorId: "",
      assignedToId: "",
      pinX: null,
      pinY: null,
      costImpact: false,
      scheduleImpact: false,
    },
  });

  useEffect(() => {
    if (countData !== undefined) {
      form.setValue("number", defaultNumber);
    }
  }, [countData, defaultNumber, form]);

  const discipline = useWatch({ control: form.control, name: "discipline" }) ?? "none";
  const priority = useWatch({ control: form.control, name: "priority" }) ?? "normal";
  const ganttTaskId = useWatch({ control: form.control, name: "ganttTaskId" }) ?? "";
  const subjectValue = useWatch({ control: form.control, name: "subject" }) ?? "";
  const descriptionValue = useWatch({ control: form.control, name: "description" }) ?? "";

  const [kbQuery, setKbQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () =>
        setKbQuery(
          subjectValue || descriptionValue ? `${subjectValue} ${descriptionValue}` : ""
        ),
      400
    );
    return () => clearTimeout(t);
  }, [subjectValue, descriptionValue]);

  const { data: kbData, isFetching: kbLoading } = trpc.workflow.rfi.searchSimilar.useQuery(
    {
      projectId,
      subject: subjectValue,
      description: descriptionValue,
      discipline: discipline !== "none" ? discipline : undefined,
    },
    {
      enabled:
        kbQuery.length > 0 && (subjectValue.length >= 3 || descriptionValue.length >= 3),
    }
  );

  const prevTaskIdRef = useRef<string>("");
  useEffect(() => {
    const taskId = ganttTaskId;
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
          setItems((prev) => [...prev, ...newItems]);
        }
      }
    }
  }, [ganttTaskId, ganttTasks?.tasks, items]);

  const uploadAttachmentMutation = trpc.workflow.rfi.uploadAttachment.useMutation();

  const mutation = trpc.workflow.rfi.create.useMutation({
    onSuccess: async (res) => {
      if (attachFiles.length > 0 && res.rfi) {
        for (const file of attachFiles) {
          try {
            await uploadAttachmentMutation.mutateAsync({
              rfiId: res.rfi.id,
              fileName: file.fileName,
              fileType: file.fileType,
              fileSize: file.fileSize,
              data: file.data,
            });
          } catch {
            // non-blocking attachment upload failure
          }
        }
      }
      toast.success("RFI created successfully");
      utils.workflow.rfi.list.invalidate({ projectId });
      utils.workflow.rfi.countAll.invalidate({ projectId });
      onCreated();
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create RFI");
    },
  });

  const onSubmit = (values: CreateRfiValues) => {
    const validItems = items
      .filter((it) => it.boqItemId)
      .map((it) => ({
        boqItemId: it.boqItemId,
        quantity: it.quantity ? parseFloat(it.quantity) : undefined,
        paymentType: it.paymentType,
      }));

    mutation.mutate({
      projectId,
      number: values.number,
      subject: values.subject,
      description: values.description || undefined,
      location: values.location || undefined,
      priority: values.priority,
      discipline: values.discipline !== "none" ? values.discipline : undefined,
      workDate: values.workDate ? new Date(values.workDate).toISOString() : undefined,
      inspectionStartTime: values.inspectionStartTime
        ? new Date(
            `${values.workDate || defaultWorkDate}T${values.inspectionStartTime}`
          ).toISOString()
        : undefined,
      inspectionEndTime: values.inspectionEndTime
        ? new Date(
            `${values.workDate || defaultWorkDate}T${values.inspectionEndTime}`
          ).toISOString()
        : undefined,
      ganttTaskId: values.ganttTaskId || undefined,
      drawingId: values.drawingId || undefined,
      subcontractorId: values.subcontractorId || undefined,
      assignedToId: values.assignedToId || undefined,
      pinX: values.pinX ?? undefined,
      pinY: values.pinY ?? undefined,
      costImpact: values.costImpact,
      scheduleImpact: values.scheduleImpact,
      items: validItems.length > 0 ? validItems : undefined,
    });
  };

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto font-mono bg-card border-border">
      <DialogHeader className="border-b border-border/80 pb-3">
        <DialogTitle className="flex items-center gap-2 text-base font-bold text-primary">
          <FileQuestion className="h-5 w-5" />
          Create Engineering Clarification / RFI
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Submit technical clarification requests, coordinate inspection windows, and link
          engineering schedule &amp; BOQ items.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        {/* Top 2-Column Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Section 1: Core Clarification & Technical Scope */}
          <div className="space-y-3 rounded border border-border/80 bg-muted/20 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-primary border-b border-border/60 pb-1.5">
              1. Core Clarification &amp; Technical Scope
            </div>

            {/* RFI Number & Discipline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="r-number" className="text-xs">
                  RFI Number *
                </Label>
                <Input
                  id="r-number"
                  {...form.register("number")}
                  className="font-mono text-xs h-8 bg-background border-border/80"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="r-discipline" className="text-xs">
                  Discipline *
                </Label>
                <Select
                  value={discipline}
                  onValueChange={(v: any) => form.setValue("discipline", v)}
                >
                  <SelectTrigger
                    id="r-discipline"
                    className="h-8 text-xs bg-background border-border/80"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCIPLINES.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Priority Button Selector */}
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {(["low", "normal", "high", "urgent"] as const).map((p) => {
                  const isSel = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => form.setValue("priority", p)}
                      className={cn(
                        "py-1 px-2 text-[11px] rounded uppercase font-mono border transition-all",
                        isSel
                          ? p === "urgent"
                            ? "bg-destructive text-destructive-foreground font-bold border-destructive shadow-sm"
                            : p === "high"
                              ? "bg-amber-500 text-white font-bold border-amber-600 shadow-sm"
                              : "bg-primary text-primary-foreground font-bold border-primary shadow-sm"
                          : "bg-background text-muted-foreground border-border/60 hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1">
              <Label htmlFor="r-subject" className="text-xs">
                Subject / Clarification Topic *
              </Label>
              <Input
                id="r-subject"
                {...form.register("subject")}
                placeholder="e.g. Foundation rebar lap length clarification at Grid C-4"
                className="text-xs h-8 bg-background border-border/80"
                required
              />
            </div>

            {/* Location / Chainage */}
            <div className="space-y-1">
              <Label htmlFor="r-location" className="text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                Physical Location / Grid / Chainage
              </Label>
              <Input
                id="r-location"
                {...form.register("location")}
                placeholder="e.g. Pier P3, Foundation Level -4.5m"
                className="text-xs h-8 bg-background border-border/80 font-mono"
              />
            </div>

            {/* Question / Description */}
            <div className="space-y-1">
              <Label htmlFor="r-desc" className="text-xs">
                Detailed Question &amp; Observations
              </Label>
              <Textarea
                id="r-desc"
                {...form.register("description")}
                rows={3}
                placeholder="Specify precise drawing discrepancies, site conditions, or engineering queries..."
                className="text-xs bg-background border-border/80 resize-none font-mono"
              />
            </div>
          </div>

          {/* Section 2: Engineering Linkages & Schedule */}
          <RfiEngineeringSection
            form={form}
            ganttTasks={ganttTasks}
            drawingsData={drawingsData}
            membersData={membersData}
            subcontractorsData={subcontractorsData}
          />
        </div>

        {/* Section 3: Linked BOQ Items Table */}
        <RfiLinkedBoqSection
          items={items}
          boqData={boqData}
          addItem={addItem}
          removeItem={removeItem}
          updateItem={updateItem}
        />

        {/* Section 4: Knowledge Base suggestions if any duplicates found */}
        {kbData && kbData.rfis.length > 0 && (
          <KbSuggestions rfis={kbData.rfis} loading={kbLoading} />
        )}

        {/* Section 5: Attachments Dropzone */}
        <div className="space-y-2 rounded border border-border/80 bg-muted/20 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-primary border-b border-border/60 pb-1.5">
            4. Attachments &amp; Specifications
          </div>
          <FileDropzone
            onUpload={(f) => setAttachFiles((p) => [...p, f])}
            uploading={attachUploading}
          />
          {attachFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {attachFiles.map((f, i) => (
                <AttachmentBadge
                  key={i}
                  file={f}
                  onRemove={() => setAttachFiles((p) => p.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          )}
        </div>

        {/* Dialog Footer Actions */}
        <div className="flex items-center justify-between border-t border-border/80 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="h-9 px-4 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-sm"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Submit RFI
            </Button>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}
