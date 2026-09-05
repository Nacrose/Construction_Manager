"use client";

import { trpc } from "@/lib/trpc-client";
import { getUser } from "@/lib/client-auth";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import Link from "next/link";
import { DocumentTrail } from "@/components/documents/document-trail";
import { format, formatDistanceToNow, differenceInHours } from "date-fns";
import { useState, useRef, useEffect, useCallback } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";


import { RespondForm } from "./respond-form";
import { EditRfiDialog } from "./edit-rfi-dialog";
import { DrawingPinPreview } from "./drawing-pin-preview";
import { CommentThread } from "./comment-thread";
import { CommentsSection } from "./comments-section";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RfiStatusBadge, RfiPriorityBadge } from "@/components/workflow/badges";
import { Switch } from "@/components/ui/switch";
import { FileDropzone, AttachmentBadge } from "@/components/workflow/file-dropzone";
import {
  FileText,
  FileQuestion,
  FileDown,
  Mail,
  Edit,
  Send,
  Trash2,
  CheckCircle2,
  X,
  Loader2,
  MessageSquare,
  XCircle,
  Plus,
  MapPin,
  History,
} from "lucide-react";

/**
 * Escape user-controlled values before interpolating them into the
 * print-window HTML template. Prevents XSS via document.write().
 */
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type RfiDetail = {
  rfi: {
    id: string;
    number: string;
    subject: string;
    description: string;
    status: string;
    priority: string;
    discipline: string | null;
    location: string | null;
    workDate: string | Date | null;
    inspectionStartTime: string | Date | null;
    inspectionEndTime: string | Date | null;
    pinX: number | null;
    pinY: number | null;
    submittedAt: string | Date | null;
    respondedAt: string | Date | null;
    createdAt: string | Date;
    ganttTaskId: string | null;
    drawingId: string | null;
    boqItemId: string | null;
    subcontractorId: string | null;
    costImpact: boolean;
    scheduleImpact: boolean;
    project: { id: string; name: string; code: string; client?: string | null };
    createdBy: { id: string; name: string };
    assignedTo: { id: string; user: { id: string; name: string } } | null;
    ganttTask: { id: string; code: string | null; name: string } | null;
    boqItem: { id: string; code: string; description: string; unit: string; rate: number } | null;
    drawing: { id: string; number: string; title: string; revision: string } | null;
    subcontractor: { id: string; name: string; contact: string | null; phone: string | null } | null;
    items: Array<{
      id: string;
      boqCode: string | null;
      boqDesc: string | null;
      quantity: number | null;
      unit: string | null;
      remark: string | null;
      boqItemId: string | null;
      paymentType: string;
    }>;
    attachments: Array<{
      id: string;
      fileName: string;
      fileType: string;
      fileSize: number;
      data: string;
      createdAt: Date;
    }>;
    comments: Array<{
      id: string;
      content: string;
      parentId: string | null;
      createdAt: Date;
      author: { id: string; name: string };
    }>;
    responses: Array<{
      id: string;
      response: string;
      decision: string;
      createdAt: Date;
      responder: { id: string; name: string };
    }>;
  };
};

const RespondSchema = z.object({
  response: z.string().min(1).max(5000),
  decision: z.enum(["info", "approved", "rejected", "clarifications_requested"]),
});
type RespondValues = z.infer<typeof RespondSchema>;

export function ViewRfiDialog({
  rfiId,
  projectId,
  open,
  onOpenChange,
}: {
  rfiId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, error } = trpc.workflow.rfi.get.useQuery(
    { id: rfiId || "" },
    { enabled: !!rfiId && open }
  );

  const { data: projectInfo } = trpc.project.get.useQuery(
    { id: projectId },
    { staleTime: 300_000, enabled: !!projectId && open }
  );

  const rfi = data?.rfi;

  const statusMutation = trpc.workflow.rfi.update.useMutation({
    onSuccess: () => {
      utils.workflow.rfi.get.invalidate({ id: rfiId || "" });
      utils.workflow.rfi.list.invalidate({ projectId });
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.workflow.rfi.delete.useMutation({
    onSuccess: () => {
      utils.workflow.rfi.list.invalidate({ projectId });
      toast.success("RFI deleted");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePdfExport = useCallback(() => {
    if (!rfi) return;
    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked. Allow pop-ups for this site."); return; }
    const amount = (qty: number | null, rate: number) =>
      qty ? formatNpr(qty * rate) : "—";
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head><title>${escapeHtml(rfi.number)}</title>
      <style>
        @page { margin: 15mm; }
        body { font: 12px/1.5 system-ui, sans-serif; color: #111; padding: 0; margin: 0; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .meta { color: #555; font-size: 11px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; font-size: 11px; }
        th { background: #f5f5f5; font-weight: 600; }
        .label { color: #666; font-weight: 500; width: 130px; }
        .section-title { font-size: 13px; font-weight: 600; margin: 16px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        .tag { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 3px; border: 1px solid #ccc; margin-right: 4px; }
        .tag-green { background: #e6f7e6; border-color: #d9efd9; }
        .tag-red { background: #fde8e8; border-color: #f5baba; }
        .tag-amber { background: #fff3cd; border-color: #ffc107; }
      </style></head>
      <body>
        <h1>${escapeHtml(rfi.number)}</h1>
        <div class="meta">${escapeHtml(rfi.subject)}</div>
        <table><tr><td class="label">Status</td><td>${escapeHtml(rfi.status)}</td><td class="label">Priority</td><td>${escapeHtml(rfi.priority)}</td></tr>
        <tr><td class="label">Category</td><td>${escapeHtml(rfi.discipline ?? "—")}</td><td class="label">Work Date</td><td>${rfi.workDate ? new Date(rfi.workDate).toLocaleDateString() : "—"}</td></tr>
        <tr><td class="label">Created</td><td>${new Date(rfi.createdAt).toLocaleDateString()}</td><td class="label">Created By</td><td>${escapeHtml(rfi.createdBy.name)}</td></tr>
        ${rfi.location ? `<tr><td class="label">Location</td><td colspan="3">${escapeHtml(rfi.location)}</td></tr>` : ""}
        ${rfi.ganttTask ? `<tr><td class="label">Linked Task</td><td colspan="3">${escapeHtml(rfi.ganttTask.code ?? "")} ${escapeHtml(rfi.ganttTask.name)}</td></tr>` : ""}
        ${rfi.drawing ? `<tr><td class="label">Drawing</td><td colspan="3">${escapeHtml(rfi.drawing.number)} Rev ${escapeHtml(rfi.drawing.revision)}</td></tr>` : ""}
        ${rfi.inspectionStartTime ? `<tr><td class="label">Inspection</td><td colspan="3">${new Date(rfi.inspectionStartTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} – ${rfi.inspectionEndTime ? new Date(rfi.inspectionEndTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ""}</td></tr>` : ""}
        ${(rfi.costImpact || rfi.scheduleImpact) ? `<tr><td class="label">Impacts</td><td colspan="3">${rfi.costImpact ? '<span class="tag tag-amber">Cost</span>' : ""} ${rfi.scheduleImpact ? '<span class="tag tag-red">Delay</span>' : ""}</td></tr>` : ""}
        </table>
        <div class="section-title">Description</div>
        <p style="white-space:pre-wrap;margin:0 0 12px;font-size:11px">${escapeHtml(rfi.description || "—")}</p>
        ${rfi.boqItem ? `<div class="section-title">Linked BOQ Item</div>
        <table><tr><th>Code</th><th>Description</th><th>Unit</th><th style="text-align:right">Rate</th></tr>
        <tr><td>${escapeHtml(rfi.boqItem.code)}</td><td>${escapeHtml(rfi.boqItem.description)}</td><td>${escapeHtml(rfi.boqItem.unit)}</td><td style="text-align:right">${formatNpr(rfi.boqItem.rate)}</td></tr></table>` : ""}
        ${rfi.items.length > 0 ? `<div class="section-title">Required Ingredients</div>
        <table><tr><th>Code</th><th>Description</th><th style="text-align:right">Qty</th><th>Unit</th><th>Payment</th><th style="text-align:right">Amount</th></tr>
        ${rfi.items.map(i => `<tr><td>${escapeHtml(i.boqCode || "—")}</td><td>${escapeHtml(i.boqDesc || "—")}</td><td style="text-align:right">${i.quantity ?? "—"}</td><td>${escapeHtml(i.unit || "—")}</td><td>${escapeHtml(i.paymentType)}</td><td style="text-align:right">${amount(i.quantity, (i as any).boqItem?.rate ?? 0)}</td></tr>`).join("")}
        <tr style="font-weight:600"><td colspan="5" style="text-align:right">Total</td><td style="text-align:right">${formatNpr(rfi.items.reduce((s, i) => s + ((i.quantity ?? 0) * ((i as any).boqItem?.rate ?? 0)), 0))}</td></tr></table>` : ""}
        ${rfi.responses.length > 0 ? `<div class="section-title">Responses</div>
        ${rfi.responses.map(r => `<div style="margin:6px 0;padding:6px;background:#f9f9f9;border:1px solid #eee;border-radius:4px"><strong>${escapeHtml(r.responder.name)}</strong> <span class="tag ${r.decision === 'approved' ? 'tag-green' : r.decision === 'rejected' ? 'tag-red' : 'tag-amber'}">${escapeHtml(r.decision.replace(/_/g, ' '))}</span><div style="margin-top:4px;font-size:11px">${escapeHtml(r.response)}</div></div>`).join("")}` : ""}
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }, [rfi]);

  if (!open || !rfiId) return null;

  const myRole = projectInfo?.myRole;
  const currentUser = getUser();
  const isWriter = !!myRole;
  const isAdmin = myRole === "project_manager" || myRole === "coordinator";
  
  const canEdit = rfi?.status === "draft" && isWriter;
  const canDelete =
    (rfi?.status === "draft" && rfi?.createdBy.id === currentUser?.id) ||
    (rfi?.status !== "draft" && myRole === "project_manager");
  const canSubmit = rfi?.status === "draft" && isWriter;
  const canRespond = rfi?.status === "submitted" && isAdmin;
  const canClose = (rfi?.status === "approved" || rfi?.status === "rejected") && isAdmin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[94vw] aspect-[16/10] max-h-[90vh] flex flex-col p-0 overflow-hidden font-mono bg-card border border-border text-foreground shadow-2xl rounded-2xl">

        {/* HEADER — no custom X button, DialogContent provides one */}
        <div className="flex shrink-0 items-center px-4 py-2 border-b border-border bg-card">
          <DialogTitle className="flex items-center gap-2 m-0 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-info" />
            {rfi?.number || <Skeleton className="h-5 w-32" />}
          </DialogTitle>
        </div>

        {isLoading ? (
          <div className="p-3 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error || !rfi ? (
          <div className="p-6 text-center text-sm text-destructive">
            {error?.message ?? "RFI not found."}
          </div>
        ) : (
          <>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 bg-background">

            {/* COMPACT METADATA BAR — no priority/category */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5 bg-muted/30 rounded text-xs border border-border/60">
              <RfiStatusBadge status={rfi.status} />
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">Created {format(new Date(rfi.createdAt), "MMM d")}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">Work {rfi.workDate ? format(new Date(rfi.workDate), "MMM d") : "N/A"}</span>
              {rfi.status === "submitted" && rfi.submittedAt && (() => {
                const hrs = differenceInHours(new Date(), new Date(rfi.submittedAt));
                const color = hrs < 48 ? "text-success" : hrs < 120 ? "text-amber-600" : "text-red-600";
                return <>
                  <span className="text-muted-foreground">·</span>
                  <span className={color}>{Math.floor(hrs / 24)}d {hrs % 24}h</span>
                </>;
              })()}
              {rfi.inspectionStartTime && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">Inspection {format(new Date(rfi.inspectionStartTime), "HH:mm")}{rfi.inspectionEndTime ? `–${format(new Date(rfi.inspectionEndTime), "HH:mm")}` : ""}</span>
                </>
              )}
            </div>

            {/* DETAILS */}
            <div className="space-y-1.5">
              <div className="min-w-0 overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground">Subject</p>
                <p className="text-sm font-medium break-all">{rfi.subject}</p>
              </div>
              <div className="min-w-0 overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground">Description</p>
                <p className="text-sm whitespace-pre-wrap break-all">{rfi.description || <span className="text-muted-foreground italic">N/A</span>}</p>
              </div>

              {/* Inline metadata grid */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs pt-0.5">
                {rfi.location && (
                  <div className="break-words"><span className="text-muted-foreground">Location: </span>{rfi.location}</div>
                )}
                {rfi.ganttTask && (
                  <div className="break-words"><span className="text-muted-foreground">Task: </span><span className="font-mono">{rfi.ganttTask.code ?? "?"}</span> {rfi.ganttTask.name}</div>
                )}
                {rfi.drawing && (
                  <div className="break-words"><span className="text-muted-foreground">Drawing: </span>{rfi.drawing.number} Rev {rfi.drawing.revision}</div>
                )}
                {rfi.subcontractor && (
                  <div className="break-words">
                    <span className="text-muted-foreground">Subcontractor: </span>
                    <Link href={`/projects/${rfi.project.id}/subcontractors`} className="text-primary hover:underline">{rfi.subcontractor.name}</Link>
                    {rfi.subcontractor.phone && <span className="text-muted-foreground"> · {rfi.subcontractor.phone}</span>}
                  </div>
                )}
                <div><span className="text-muted-foreground">Created by: </span>{rfi.createdBy.name}</div>
                {rfi.assignedTo && (
                  <div><span className="text-muted-foreground">Assigned to: </span>{rfi.assignedTo.user.name}</div>
                )}
                {(rfi.costImpact || rfi.scheduleImpact) && (
                  <div className="flex gap-1">
                    {rfi.costImpact && <span className="text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-200">Cost</span>}
                    {rfi.scheduleImpact && <span className="text-[10px] font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded border border-rose-200">Delay</span>}
                  </div>
                )}
              </div>

              {/* Drawing pin */}
              {rfi.drawing && rfi.pinX != null && rfi.pinY != null && (
                <div>
                  <a
                    href={`/projects/${rfi.project.id}/drawings`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    <MapPin className="h-3 w-3" /> Pinned at ({Math.round(rfi.pinX * 100)}%, {Math.round(rfi.pinY * 100)}%)
                  </a>
                  {rfi.drawingId && <DrawingPinPreview drawingId={rfi.drawingId} pinX={rfi.pinX} pinY={rfi.pinY} />}
                </div>
              )}
            </div>

            {/* BOQ Item — table-fixed + break-words for wrapping */}
            {rfi.items.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">BOQ Item</p>
                <div className="border border-border rounded-md overflow-x-auto">
                  <Table className="table-fixed w-full">
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="text-xs h-6 px-2 w-16">Code</TableHead>
                        <TableHead className="text-xs h-6 px-2">Description</TableHead>
                        <TableHead className="text-xs h-6 px-2 text-right w-12">Qty</TableHead>
                        <TableHead className="text-xs h-6 px-2 w-14">Unit</TableHead>
                        <TableHead className="text-xs h-6 px-2 w-20">Payment</TableHead>
                        <TableHead className="text-xs h-6 px-2 text-right w-24">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rfi.items.map((item) => {
                        const amt = (item.quantity ?? 0) * ((item as any).boqItem?.rate ?? 0);
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-xs py-1 px-2 break-words">{item.boqCode || "—"}</TableCell>
                            <TableCell className="text-xs py-1 px-2 break-words">{item.boqDesc || "—"}</TableCell>
                            <TableCell className="text-right text-xs py-1 px-2">{item.quantity ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-xs py-1 px-2">{item.unit || "—"}</TableCell>
                            <TableCell className="text-xs py-1 px-2">
                              <span className={cn(
                                "text-[10px] font-medium px-1.5 py-0.5 rounded",
                                item.paymentType === "payable" && "bg-success/10 text-success dark:bg-success dark:text-success/80",
                                item.paymentType === "unpayable" && "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
                                item.paymentType === "temporary" && "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
                              )}>
                                {item.paymentType === "payable" ? "Payable" : item.paymentType === "unpayable" ? "Unpayable" : "Temp."}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-xs py-1 px-2 font-mono whitespace-nowrap">
                              {item.quantity ? formatNpr(amt) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell colSpan={4} className="text-xs py-1 px-2 text-right">Total</TableCell>
                        <TableCell colSpan={2} className="text-xs py-1 px-2 text-right font-mono whitespace-nowrap">
                          {formatNpr(rfi.items.reduce((sum, item) => sum + ((item.quantity ?? 0) * ((item as any).boqItem?.rate ?? 0)), 0))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* RESPONSES */}
            {rfi.responses.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Official Responses</p>
                <div className="space-y-1">
                  {rfi.responses.map((resp) => (
                    <div key={resp.id} className="bg-muted/20 p-1.5 rounded border border-border/60">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs"><strong>{resp.responder.name}</strong> <span className="text-muted-foreground">· {formatDistanceToNow(new Date(resp.createdAt), { addSuffix: true })}</span></span>
                        <Badge variant="outline" className={`text-[9px] capitalize px-1 py-0 ${
                          resp.decision === "approved" ? "bg-success/10 text-success border-success/30" :
                          resp.decision === "rejected" ? "bg-red-50 text-red-700 border-red-200" :
                          resp.decision === "clarifications_requested" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-info/10 text-info border-info/30"
                        }`}>
                          {resp.decision.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-xs whitespace-pre-wrap break-words">{resp.response}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RESPONSE SUBMISSION AREA */}
            {canRespond && (
              <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded p-2">
                <div className="text-xs font-semibold text-amber-900 dark:text-amber-500 mb-1.5 flex items-center gap-1.5">
                  <FileQuestion className="h-3.5 w-3.5" /> Add Response
                </div>
                <RespondForm rfiId={rfiId} projectId={projectId} />
              </div>
            )}

            {/* ATTACHMENTS */}
            {rfi.attachments.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Attachments ({rfi.attachments.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {rfi.attachments.map((file, idx) => (
                    <AttachmentBadge key={idx} file={file} onRemove={() => {}} downloadable />
                  ))}
                </div>
              </div>
            )}

            {/* DISCUSSION */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Discussion
              </p>
              <CommentsSection rfiId={rfi.id} projectId={projectId} comments={rfi.comments} currentUser={getUser()} />
            </div>

            {/* ACTIVITY LOG */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> Activity
              </p>
              <div className="space-y-1">
                {[
                  { label: "RFI created", time: rfi.createdAt, user: rfi.createdBy.name, icon: FileText },
                  ...(rfi.submittedAt
                    ? [{ label: "RFI submitted", time: rfi.submittedAt, user: "", icon: Send as React.ComponentType<{ className?: string }> }]
                    : []),
                  ...(rfi.responses.map(r => ({
                    label: `${r.responder.name} ${r.decision === "approved" ? "approved" : r.decision === "rejected" ? "rejected" : "responded"}`,
                    time: r.createdAt,
                    user: "",
                    icon: r.decision === "approved" ? CheckCircle2 : r.decision === "rejected" ? XCircle : (Mail as React.ComponentType<{ className?: string }>),
                  }))),
                ].map((event, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-xs">
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted">
                      <event.icon className="h-2 w-2 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{event.label}</span>
                      <span className="text-muted-foreground ml-1">
                        {event.user ? `· ${event.user} · ` : "· "}
                        {formatDistanceToNow(new Date(event.time), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* DOCUMENT TRAIL — signed hardcopy archive */}
            <DocumentTrail
              projectId={projectId}
              entityType="rfi"
              entityId={rfi.id}
              defaultSignedBy={rfi.project?.client ?? undefined}
              compact
            />
          </div>

          {/* STICKY FOOTER — secondary left, primary right */}
          <div className="shrink-0 flex items-center gap-2 border-t border-border bg-background px-3 py-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handlePdfExport}>
              <FileDown className="mr-1 h-3 w-3" /> PDF
            </Button>
            {canEdit && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditOpen(true)}>
                <Edit className="mr-1 h-3 w-3" /> Edit
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-1 h-3 w-3" /> Delete
              </Button>
            )}
            <div className="flex-1" />
            {canSubmit && (
              <Button size="sm" className="h-7 text-xs" onClick={() => statusMutation.mutate({ id: rfiId, status: "submitted" })} disabled={statusMutation.isPending}>
                {statusMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                Submit
              </Button>
            )}
            {canClose && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => statusMutation.mutate({ id: rfiId, status: "closed" })} disabled={statusMutation.isPending}>
                {statusMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                Close
              </Button>
            )}
          </div>
          </>
        )}

        {/* EDIT MODAL OVERLAY — only mounted when open to avoid fetching
            gantt/boq/drawings data on every RFI view */}
        {canEdit && editOpen && (
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <EditRfiDialog
              rfiId={rfiId}
              projectId={projectId}
              rfi={rfi!}
              onDone={() => setEditOpen(false)}
            />
          </Dialog>
        )}

        {/* DELETE ALERT OVERLAY */}
        {canDelete && (
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this RFI?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes <strong>{rfi?.number}</strong>. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={deleteMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    deleteMutation.mutate({ id: rfiId });
                  }}
                >
                  {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start text-[0.85rem]">
      <div className="w-[140px] font-semibold text-muted-foreground shrink-0">{label}</div>
      <div className="flex-1 text-foreground min-w-0">{children}</div>
    </div>
  );
}
