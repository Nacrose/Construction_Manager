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
  status: string;
  priority: string;
  discipline: string | null;
  workDate: string | null;
  inspectionStartTime: string | null;
  inspectionEndTime: string | null;
  submittedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  projectId: string;
  location: string | null;
  costImpact: boolean;
  scheduleImpact: boolean;
  createdBy: { id: string; name: string } | null;
  assignedTo: { user: { id: string; name: string } } | null;
  ganttTask: { id: string; code: string | null; name: string } | null;
  boqItem: { id: string; code: string; description: string } | null;
  dailyProgramTasks: Array<{
    id: string;
    plannedQty: number;
    actualQty: number | null;
    carriedOverFromId: string | null;
    executionStatus: string;
  }> | null;
  items: Array<{
    id: string;
    boqItemId: string | null;
    quantity: number | null;
    unit: string | null;
    paymentType: string;
    boqCode: string | null;
    boqDesc: string | null;
  }> | null;
  _count: { attachments: number; responses: number };
};

// RFI as returned by GET /api/rfis/[id] (detail shape).
export type RfiItem = {
  id: string;
  rfiId: string;
  boqItemId: string | null;
  boqCode: string | null;
  boqDesc: string | null;
  quantity: number | null;
  unit: string | null;
  paymentType: string;
  remark: string | null;
};

export type RfiAttachment = {
  id: string;
  rfiId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageUrl: string;
  data: string;
  uploadedById?: string | null;
  createdAt: Date | string;
};

export type RfiResponseEntry = {
  id: string;
  rfiId: string;
  responderId: string;
  response: string;
  decision: string;
  createdAt: Date | string;
  responder: { id: string; name: string; role: string } | null;
};

export type RfiDetail = {
  id: string;
  number: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  discipline: string | null;
  workDate: Date | string | null;
  inspectionStartTime: Date | string | null;
  inspectionEndTime: Date | string | null;
  submittedAt: Date | string | null;
  respondedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdById: string;
  projectId: string;
  ganttTaskId: string | null;
  boqItemId: string | null;
  drawingId: string | null;
  subcontractorId: string | null;
  location: string | null;
  costImpact: boolean;
  scheduleImpact: boolean;
  project: { id: string; name: string; code: string };
  createdBy: { id: string; name: string; role: string } | null;
  ganttTask: { id: string; code: string | null; name: string } | null;
  boqItem: { id: string; code: string; description: string; unit: string } | null;
  drawing: { id: string; number: string; title: string; revision: string } | null;
  subcontractor: { id: string; name: string; contact: string | null } | null;
  assignedTo: { id: string; user: { id: string; name: string } } | null;
  items: RfiItem[];
  attachments: RfiAttachment[];
  responses: RfiResponseEntry[];
  dailyProgramTasks?: Array<{
    id: string;
    plannedQty: number;
    actualQty: number | null;
    carriedOverFromId: string | null;
    executionStatus: string;
  }>;
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
