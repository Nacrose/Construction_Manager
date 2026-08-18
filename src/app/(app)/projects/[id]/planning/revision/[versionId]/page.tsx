"use client";

import {use, Suspense} from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ArrowLeft, HardHat } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

export default function RevisionDocumentPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Skeleton className="h-96 w-full" /></div>}>
      <RevisionDocContent params={params} />
    </Suspense>
  );
}

function RevisionDocContent({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = use(params);
  const { data, isLoading } = trpc.gantt.getRevisionDocument.useQuery({ projectId: id, versionId });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-96 w-full max-w-3xl" />
      </div>
    );
  }

  if (!data) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Revision not found.</div>;
  }

  const { version, project, previousVersion, approvedBy, impact, submittedBy } = data as any;
  const fmtDate = (d: Date | string | null) => d ? format(new Date(d), "dd MMM yyyy") : "—";

  return (
    <div className="min-h-screen bg-background">
      {/* Action bar — hidden when printing */}
      <div className="no-print sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-2 backdrop-blur-md">
        <Link href={`/projects/${id}/boq?tab=schedule`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Schedule
          </Button>
        </Link>
        <Button size="sm" onClick={() => window.print()} className="gap-1.5 text-xs bg-navy-gradient text-white border-0">
          <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
        </Button>
      </div>

      {/* Printable document */}
      <div className="print-area mx-auto max-w-3xl p-8 sm:p-12">
        {/* Header */}
        <div className="mb-8 border-b-2 border-black pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-gradient text-white">
                <HardHat className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Construction Manager</h1>
                <p className="text-xs text-muted-foreground">Schedule Revision Request</p>
              </div>
            </div>
            <div className="text-right text-xs">
              <p className="font-mono font-bold">REV-{String(version.versionNumber).padStart(3, "0")}</p>
              <p className="text-muted-foreground">{fmtDate(version.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="mb-6 text-center text-lg font-bold uppercase tracking-wider">
          Schedule Revision Request — v{version.versionNumber}
        </h2>

        {/* Project info */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Row label="Project Name" value={project.name} />
            <Row label="Project Code" value={project.code} mono />
            <Row label="Client" value={project.client || "—"} />
            <Row label="Location" value={project.location || "—"} />
          </div>
          <div className="space-y-1.5">
            <Row label="Contract Value" value={`NPR ${project.contractValue?.toLocaleString("en-IN") ?? "—"}`} mono />
            <Row label="Original Start" value={fmtDate(project.startDate)} />
            <Row label="Original End" value={fmtDate(project.endDate)} />
            <Row label="Revision Status" value={version.revisionStatus} />
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 border-t" />

        {/* Revision details */}
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide">Revision Details</h3>
        <div className="mb-6 rounded border p-4">
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Reason for Revision</p>
            <p className="mt-1 text-sm">{version.revisionReason || "—"}</p>
          </div>
          {previousVersion && (
            <div className="grid grid-cols-2 gap-4">
              <Row label="Previous Baseline" value={`v${previousVersion.versionNumber}: ${previousVersion.name || "—"}`} />
              <Row label="Previous Approved" value={fmtDate(previousVersion.approvedAt)} />
            </div>
          )}
        </div>

        {/* Impact summary */}
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide">Impact Summary</h3>
        <table className="mb-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="p-2 text-left font-semibold">Metric</th>
              <th className="p-2 text-right font-semibold">Previous</th>
              <th className="p-2 text-right font-semibold">Revised</th>
              <th className="p-2 text-right font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="p-2">Project Start Date</td>
              <td className="p-2 text-right font-mono">{fmtDate(impact.prevProjectStart)}</td>
              <td className="p-2 text-right font-mono">{fmtDate(impact.currProjectStart)}</td>
              <td className="p-2 text-right text-muted-foreground">—</td>
            </tr>
            <tr className="border-b">
              <td className="p-2">Project End Date</td>
              <td className="p-2 text-right font-mono">{fmtDate(impact.prevProjectEnd)}</td>
              <td className="p-2 text-right font-mono">{fmtDate(impact.currProjectEnd)}</td>
              <td className="p-2 text-right text-muted-foreground">—</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-medium">Total Duration</td>
              <td className="p-2 text-right font-mono">{impact.prevDuration} days</td>
              <td className="p-2 text-right font-mono">{impact.currDuration} days</td>
              <td className={`p-2 text-right font-mono font-bold ${impact.durationChange > 0 ? "text-red-600" : impact.durationChange < 0 ? "text-emerald-600" : ""}`}>
                {impact.durationChange > 0 ? "+" : ""}{impact.durationChange} days
              </td>
            </tr>
            <tr className="border-b">
              <td className="p-2">Total Tasks</td>
              <td className="p-2 text-right font-mono">{impact.totalTasks - impact.newTasks}</td>
              <td className="p-2 text-right font-mono">{impact.totalTasks}</td>
              <td className="p-2 text-right font-mono">{impact.newTasks > 0 ? `+${impact.newTasks}` : "0"}</td>
            </tr>
            <tr>
              <td className="p-2">Tasks Modified</td>
              <td className="p-2 text-right font-mono" colSpan={2}>{impact.changedTasks} of {impact.totalTasks}</td>
              <td className="p-2 text-right text-muted-foreground">—</td>
            </tr>
          </tbody>
        </table>

        {/* Approval section */}
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide">Approval</h3>
        <div className="mb-6 grid grid-cols-2 gap-6">
          {/* Submitted by */}
          <div className="border-2 border-dashed border-gray-300 p-4">
            <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Submitted By</p>
            <p className="text-sm font-medium">{submittedBy?.name || "—"}</p>
            <p className="text-xs text-muted-foreground">{submittedBy?.email || "—"}</p>
            <p className="mt-2 text-xs">Date: {fmtDate(version.submittedAt || version.createdAt)}</p>
            <div className="mt-8 border-t pt-1 text-[10px] text-muted-foreground">Signature</div>
          </div>
          {/* Approved by */}
          <div className="border-2 border-dashed border-gray-300 p-4">
            <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Approved By (Client)</p>
            <p className="text-sm font-medium">{approvedBy?.name || "________________________"}</p>
            <p className="text-xs text-muted-foreground">{approvedBy?.email || ""}</p>
            <p className="mt-2 text-xs">Date: {fmtDate(version.approvedAt)}</p>
            {version.approvalNote && (
              <p className="mt-1 text-xs italic">Note: {version.approvalNote}</p>
            )}
            <div className="mt-8 border-t pt-1 text-[10px] text-muted-foreground">Signature</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 border-t-2 border-black pt-2 text-center text-[10px] text-muted-foreground">
          <p>Construction Manager — Schedule Revision Request — REV-{String(version.versionNumber).padStart(3, "0")}</p>
          <p>Generated on {format(new Date(), "dd MMM yyyy 'at' HH:mm")} · This document is system-generated and authoritative.</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
