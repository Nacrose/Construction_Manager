"use client";

import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageCircle, Mail, Link as LinkIcon, Printer, Check, Copy, FileText, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

type Report = {
  id: string;
  number: string;
  reportDate: string;
  status: string;
  projectId: string;
  workforce?: string | null;
  workProgress?: string | null;
  equipmentUsed?: string | null;
  problems?: string | null;
  safetyNotes?: string | null;
  project?: { name: string; code: string; client?: string | null };
  createdBy?: { name: string };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: Report | null;
  clientName?: string;
};

function parseJson(value: string | null | undefined): any[] {
  if (!value) return [];
  try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; }
}

function summarizeReport(report: Report): string {
  const workforce = parseJson(report.workforce);
  const progress = parseJson(report.workProgress);
  const equipment = parseJson(report.equipmentUsed);

  const totalPeople = workforce.reduce((s, w) => s + (Number(w.headcount) || 0), 0);
  const tasksDone = progress.filter(p => (Number(p.actualQty) || 0) >= (Number(p.plannedQty) || 0) && (Number(p.actualQty) || 0) > 0).length;
  const tasksPartial = progress.filter(p => (Number(p.actualQty) || 0) > 0 && (Number(p.actualQty) || 0) < (Number(p.plannedQty) || 0)).length;
  const tasksBacklog = progress.filter(p => (Number(p.actualQty) || 0) === 0 && (Number(p.plannedQty) || 0) > 0).length;

  const lines: string[] = [];
  lines.push(`*${report.number}* — Daily Site Report`);
  lines.push(`${format(new Date(report.reportDate), "dd MMM yyyy")}`);
  if (report.project?.name) {
    lines.push(`${report.project.name}`);
  }
  lines.push("");
  lines.push(`Workforce: ${totalPeople} persons (${workforce.length} crews)`);
  lines.push(`Equipment: ${equipment.length} units`);
  lines.push(`Tasks: ${tasksDone} done, ${tasksPartial} partial, ${tasksBacklog} not started`);
  if (report.problems?.trim()) {
    const p = report.problems.trim();
    lines.push(`Issues: ${p.slice(0, 80)}${p.length > 80 ? "..." : ""}`);
  } else {
    lines.push(`No issues reported`);
  }
  lines.push("");
  lines.push(`Prepared by: ${report.createdBy?.name ?? "—"}`);
  return lines.join("\n");
}

export function ShareReportDialog({ open, onOpenChange, report, clientName }: Props) {
  const [copied, setCopied] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const emailMut = trpc.workflow.dailyReport.emailReport.useMutation({
    onSuccess: () => {
      toast.success("Email sent successfully");
      setEmailSent(true);
    },
    onError: (e) => toast.error(e.message),
  });

  const reportUrl = useMemo(() => {
    if (typeof window === "undefined" || !report) return "";
    return `${window.location.origin}/projects/${report.projectId}/workflow/reports/${report.id}`;
  }, [report]);

  const printUrl = useMemo(() => {
    if (typeof window === "undefined" || !report) return "";
    return `${window.location.origin}/projects/${report.projectId}/workflow/reports/${report.id}/print`;
  }, [report]);

  const designerHref = useMemo(() => {
    if (!report) return "";
    return `/projects/${report.projectId}/workflow/reports/${report.id}/pdf-designer`;
  }, [report]);

  const summary = useMemo(() => report ? summarizeReport(report) : "", [report]);

  if (!report) return null;

  const handleWhatsApp = () => {
    const text = `${summary}\n\nView report:\n${reportUrl}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleWhatsAppClient = () => {
    const text =
      `Dear ${clientName || "Client"},\n\n` +
      `Please find today's daily site report below.\n\n` +
      `${summary}\n\n` +
      `View full report:\n${reportUrl}\n\n` +
      `Please review and share your approval. Thank you.`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(reportUrl);
      setCopied(true);
      toast.success("Report link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = reportUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      toast.success("Report link copied");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenPrint = () => {
    window.open(printUrl, "_blank", "noopener,noreferrer");
  };

  const handleSendEmail = () => {
    if (!emailTo.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    emailMut.mutate({
      reportId: report.id,
      to: emailTo,
      subject: `${report.number} — Daily Site Report (${format(new Date(report.reportDate), "dd MMM yyyy")})`,
      message: emailMessage || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share Report — {report.number}</DialogTitle>
          <DialogDescription>
            Dispatch {report.number} ({format(new Date(report.reportDate), "dd MMM yyyy")}) to the client or stakeholders.
            The link opens a live read-only view; the printable view auto-opens the browser print dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-950"
              onClick={handleWhatsAppClient}
            >
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              <div className="text-xs font-medium">WhatsApp</div>
              <div className="text-[10px] text-muted-foreground">Pre-filled for client</div>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-info/10 hover:border-info/40 dark:hover:bg-[var(--navy-deep)]"
              onClick={handleSendEmail}
              disabled={emailMut.isPending}
            >
              {emailMut.isPending ? (
                <Loader2 className="h-5 w-5 text-info animate-spin" />
              ) : (
                <Mail className="h-5 w-5 text-info" />
              )}
              <div className="text-xs font-medium">Email</div>
              <div className="text-[10px] text-muted-foreground">Send via SMTP</div>
            </Button>

            <Link href={designerHref} onClick={() => onOpenChange(false)}>
              <Button
                variant="outline"
                className="h-auto py-3 w-full flex flex-col items-center gap-1.5 hover:bg-muted/60 hover:border-border dark:hover:bg-[var(--navy-mid)]"
              >
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="text-xs font-medium">PDF Designer</div>
                <div className="text-[10px] text-muted-foreground">Custom layout editor</div>
              </Button>
            </Link>

            <Button
              variant="outline"
              className="h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-muted/60 hover:border-border dark:hover:bg-[var(--navy-mid)]"
              onClick={handleOpenPrint}
            >
              <Printer className="h-5 w-5 text-muted-foreground" />
              <div className="text-xs font-medium">Quick Print</div>
              <div className="text-[10px] text-muted-foreground">Default template</div>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-amber-50 hover:border-amber-300 dark:hover:bg-amber-950"
              onClick={handleCopyLink}
            >
              {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <LinkIcon className="h-5 w-5 text-amber-600" />}
              <div className="text-xs font-medium">{copied ? "Copied!" : "Copy Link"}</div>
              <div className="text-[10px] text-muted-foreground">Share anywhere</div>
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Email recipient</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="client@example.com"
                value={emailTo}
                onChange={(e) => { setEmailTo(e.target.value); setEmailSent(false); }}
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSendEmail}
                disabled={emailMut.isPending}
                className="h-9 shrink-0"
              >
                {emailMut.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : emailSent ? (
                  <Check className="h-3 w-3 mr-1" />
                ) : (
                  <Mail className="h-3 w-3 mr-1" />
                )}
                {emailMut.isPending ? "Sending..." : emailSent ? "Sent" : "Send"}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Optional message (included in email body)</Label>
            <Textarea
              placeholder="Add a note to include in the email..."
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              className="h-20 text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Direct report URL</Label>
            <div className="flex gap-2 items-center">
              <Input readOnly value={reportUrl} className="h-9 text-xs font-mono" />
              <Button size="sm" variant="ghost" className="h-9 shrink-0 px-2" onClick={handleCopyLink}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">WhatsApp / Email summary preview</Label>
            <Textarea
              readOnly
              value={summary}
              className="font-mono text-[11px] h-32 resize-none bg-muted/30"
            />
            <p className="text-[10px] text-muted-foreground">
              Auto-generated from report data. The recipient sees the summary inline, plus a clickable link to the full report.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
