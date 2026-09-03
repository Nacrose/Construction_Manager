"use client";

import { Textarea } from "@/components/ui/textarea";
import { DocumentTrail } from "@/components/documents/document-trail";
import { AlertCircle, Shield, FileText } from "lucide-react";

export function ProblemsSection({
  report,
  canEdit,
  saveField,
}: {
  report: any;
  canEdit: boolean;
  saveField: (field: string, val: any) => void | Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600" /> Problems, Delays & Obstacles
      </h3>
      <Textarea
        rows={6}
        className="text-sm leading-relaxed"
        defaultValue={report.problems || ""}
        onBlur={(e) => saveField("problems", e.target.value || undefined)}
        disabled={!canEdit}
        placeholder="Record any equipment breakdowns, material shortages, weather holdups, drawing revisions, or site disputes..."
      />
    </div>
  );
}

export function SafetySection({
  report,
  canEdit,
  saveField,
}: {
  report: any;
  canEdit: boolean;
  saveField: (field: string, val: any) => void | Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Shield className="h-4 w-4 text-success" /> Health, Safety & Environment (HSE) Notes
      </h3>
      <Textarea
        rows={6}
        className="text-sm leading-relaxed"
        defaultValue={report.safetyNotes || ""}
        onBlur={(e) => saveField("safetyNotes", e.target.value || undefined)}
        disabled={!canEdit}
        placeholder="Toolbox talks conducted, PPE enforcement, hazard identifications, near-misses, or first aid incidents..."
      />
    </div>
  );
}

export function RemarksSection({
  report,
  reportId,
  projectId,
  canEdit,
  saveField,
}: {
  report: any;
  reportId: string;
  projectId: string;
  canEdit: boolean;
  saveField: (field: string, val: any) => void | Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> General Remarks & Instructions
        </h3>
        <Textarea
          rows={5}
          className="text-sm leading-relaxed"
          defaultValue={report.remarks || ""}
          onBlur={(e) => saveField("remarks", e.target.value || undefined)}
          disabled={!canEdit}
          placeholder="Additional notes, instructions from the Resident Engineer, or general observations..."
        />
      </div>

      <div className="pt-4 border-t">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Scanned Signed PDF & Document Trail
        </h4>
        <DocumentTrail
          entityType="daily_report"
          entityId={reportId}
          projectId={projectId}
          title={`${report.number} Signed Attachments`}
        />
      </div>
    </div>
  );
}
