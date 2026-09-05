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
      <DialogContent className="sm:max-w-4xl w-[92vw] aspect-[16/10] max-h-[90vh] flex flex-col bg-card border border-border text-foreground rounded-2xl shadow-2xl overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0 bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-semibold text-foreground tracking-tight flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Share Report — {report.number}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Dispatch {report.number} ({format(new Date(report.reportDate), "dd MMM yyyy")}) to client or stakeholders.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0 divide-y md:divide-y-0 md:divide-x divide-border overflow-hidden">
          {/* Left Column: Channels & Email */}
          <div className="md:col-span-6 p-6 space-y-4 overflow-y-auto">
            <div>
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                Quick Channels
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-auto py-2.5 px-3 flex items-center justify-start gap-2.5 bg-background border-border text-foreground hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-colors"
                  onClick={handleWhatsAppClient}
                >
                  <MessageCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div className="text-left leading-tight">
                    <div className="text-xs font-medium">WhatsApp Client</div>
                    <div className="text-[10px] text-muted-foreground">Pre-filled message</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-2.5 px-3 flex items-center justify-start gap-2.5 bg-background border-border text-foreground hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-colors"
                  onClick={handleWhatsApp}
                >
                  <MessageCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div className="text-left leading-tight">
                    <div className="text-xs font-medium">WhatsApp General</div>
                    <div className="text-[10px] text-muted-foreground">Raw summary & link</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-2.5 px-3 flex items-center justify-start gap-2.5 bg-background border-border text-foreground hover:bg-muted/60 transition-colors"
                  onClick={handleOpenPrint}
                >
                  <Printer className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-left leading-tight">
                    <div className="text-xs font-medium">Quick Print</div>
                    <div className="text-[10px] text-muted-foreground">Default PDF print</div>
                  </div>
                </Button>

                <Link href={designerHref} onClick={() => onOpenChange(false)} className="block">
                  <Button
                    variant="outline"
                    className="w-full h-auto py-2.5 px-3 flex items-center justify-start gap-2.5 bg-background border-border text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="text-left leading-tight">
                      <div className="text-xs font-medium">PDF Designer</div>
                      <div className="text-[10px] text-muted-foreground">Custom layout</div>
                    </div>
                  </Button>
                </Link>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-medium text-foreground">Direct URL</Label>
              <div className="flex gap-2 items-center">
                <Input
                  readOnly
                  value={reportUrl}
                  className="h-8 text-xs font-mono bg-background border-border text-foreground select-all"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 px-2.5 border-border hover:bg-muted"
                  onClick={handleCopyLink}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Direct Email Dispatch
              </Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="client@example.com"
                  value={emailTo}
                  onChange={(e) => { setEmailTo(e.target.value); setEmailSent(false); }}
                  className="h-8 text-xs bg-background border-border"
                />
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={emailMut.isPending}
                  className="h-8 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-3 font-medium"
                >
                  {emailMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : emailSent ? (
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {emailMut.isPending ? "Sending..." : emailSent ? "Sent" : "Send"}
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Optional Email Note</Label>
                <Textarea
                  placeholder="Add custom note to accompany the email..."
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  className="h-16 text-xs resize-none bg-background border-border"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Dispatch Preview */}
          <div className="md:col-span-6 p-6 flex flex-col min-h-0 bg-muted/20">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Live Message Preview
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                onClick={handleCopyLink}
              >
                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <LinkIcon className="h-3 w-3" />}
                {copied ? "Copied" : "Copy Link"}
              </Button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <Textarea
                readOnly
                value={summary}
                className="font-mono text-xs flex-1 min-h-[160px] resize-none bg-background border-border text-foreground p-3 leading-relaxed rounded-xl focus-visible:ring-0"
              />
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                Auto-generated summary from report data. Recipients receive this breakdown inline with access credentials or public share token.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            className="border-border text-xs h-8 px-4"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
