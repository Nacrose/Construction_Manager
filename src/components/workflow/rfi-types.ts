// Shared TypeScript types for the RFI module.
// These mirror the shapes returned by the existing API routes and are
// re-used by the list page, detail page, and forms.

export type RfiStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "closed";

export type RfiPriority = "low" | "normal" | "high" | "urgent";

export type RfiDiscipline =
  | "civil"
  | "structural"
  | "electrical"
  | "mechanical"
  | "architectural";

export type RfiDecision =
  | "info"
  | "approved"
  | "rejected"
  | "clarifications_requested";

export type RfiItemInput = {
  boqCode?: string;
  boqDesc?: string;
  quantity?: number;
  unit?: string;
  remark?: string;
};

// RFI as returned by GET /api/projects/[id]/rfis (list shape).
export type RfiListItem = {
  id: string;
  number: string;
  subject: string;
  description: string;
  status: RfiStatus;
  priority: RfiPriority;
  discipline: RfiDiscipline | null;
  workDate: string | null;
  inspectionStartTime: string | null;
  inspectionEndTime: string | null;
  submittedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  projectId: string;
  createdBy: { id: string; name: string } | null;
  _count: { attachments: number; responses: number };
};

// RFI as returned by GET /api/rfis/[id] (detail shape).
export type RfiItem = {
  id: string;
  rfiId: string;
  boqCode: string | null;
  boqDesc: string | null;
  quantity: number | null;
  unit: string | null;
  remark: string | null;
};

export type RfiAttachment = {
  id: string;
  rfiId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  createdAt: string;
};

export type RfiResponseEntry = {
  id: string;
  rfiId: string;
  responderId: string;
  response: string;
  decision: RfiDecision;
  createdAt: string;
  responder: { id: string; name: string; role: string } | null;
};

export type RfiDetail = {
  id: string;
  number: string;
  subject: string;
  description: string;
  status: RfiStatus;
  priority: RfiPriority;
  discipline: RfiDiscipline | null;
  workDate: string | null;
  inspectionStartTime: string | null;
  inspectionEndTime: string | null;
  submittedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  projectId: string;
  project: { id: string; name: string; code: string };
  createdBy: { id: string; name: string; role: string } | null;
  items: RfiItem[];
  attachments: RfiAttachment[];
  responses: RfiResponseEntry[];
};

export const STATUS_LABELS: Record<RfiStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Closed",
};

export const PRIORITY_LABELS: Record<RfiPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const DISCIPLINE_LABELS: Record<RfiDiscipline, string> = {
  civil: "Civil",
  structural: "Structural",
  electrical: "Electrical",
  mechanical: "Mechanical",
  architectural: "Architectural",
};

export const DECISION_LABELS: Record<RfiDecision, string> = {
  info: "Information",
  approved: "Approved",
  rejected: "Rejected",
  clarifications_requested: "Clarifications Requested",
};
