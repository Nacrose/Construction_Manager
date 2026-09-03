/**
 * Report Designer — Types, Token Registry, and Table Schemas
 *
 * This module defines:
 *   1. The Layout JSON schema (saved in ReportTemplate.layout)
 *   2. Token registry per entity type (e.g. {{report.number}}, {{workforce.total}})
 *   3. Table column schemas per entity (for the "Insert Table" block)
 *
 * The designer is entity-agnostic — adding a new entity type means registering
 * its tokens and table schemas here. The UI, canvas, and renderer don't change.
 */

// ─────────────────────────────────────────────────────────────
// Layout Schema
// ─────────────────────────────────────────────────────────────

export type PaperSize = "A4" | "A3" | "Letter" | "Legal";
export type Orientation = "portrait" | "landscape";
export type CellType = "text" | "table" | "kpi" | "image" | "divider" | "signature";

export type CellStyle = {
  fontSize?: number;       // pt
  fontFamily?: string;     // "system" | "serif" | "sans-serif"
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;          // hex
  bg?: string;             // hex
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  border?: string;         // "none" | "all" | "bottom" | "top" | "left" | "right"
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;        // pt
};

export type Cell = {
  id: string;
  type: CellType;
  // Position in mm from page top-left
  x: number;
  y: number;
  w: number;
  h: number;
  // Per-type content
  content: TextContent | TableContent | KpiContent | ImageContent | DividerContent | SignatureContent;
  style: CellStyle;
  // Layout metadata
  locked?: boolean;          // if true, cell can't be moved/resized/deleted
  zIndex?: number;           // render order; higher = on top. Default 0.
};

export type TextContent = {
  type: "text";
  text: string;            // may contain {{tokens}}
};

export type TableContent = {
  type: "table";
  entity: string;          // "workforce" | "equipment" | "progress" | "materials" | "visitors" | "meetings"
  columns: string[];       // subset of available columns for that entity
  columnWidths?: Record<string, number>;  // relative widths per column id (e.g. { company: 2, trade: 1 })
  showHeader?: boolean;
  zebra?: boolean;
};

export type KpiContent = {
  type: "kpi";
  metric: string;          // token like "workforce.total"
  label: string;           // display label
  format?: "number" | "currency" | "percent" | "text";
};

export type ImageContent = {
  type: "image";
  src: string;             // data URL or external URL
  alt?: string;
  fit?: "contain" | "cover" | "fill";
};

export type DividerContent = {
  type: "divider";
  orientation: "horizontal" | "vertical";
  thickness?: number;
};

export type SignatureContent = {
  type: "signature";
  role: "prepared" | "submitted" | "approved" | "custom";
  customLabel?: string;
};

export type PageSettings = {
  paper: PaperSize;
  orientation: Orientation;
  margin: { top: number; right: number; bottom: number; left: number }; // mm
  watermark?: { text: string; color: string; opacity: number };
  headerNote?: string;
  footerNote?: string;
};

export type ReportLayout = {
  page: PageSettings;
  cells: Cell[];
};

// ─────────────────────────────────────────────────────────────
// Page dimensions (in mm)
// ─────────────────────────────────────────────────────────────

export const PAGE_DIMENSIONS: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 },
};

export function getPageSize(page: PageSettings): { w: number; h: number } {
  const dim = PAGE_DIMENSIONS[page.paper];
  return page.orientation === "landscape"
    ? { w: dim.h, h: dim.w }
    : { w: dim.w, h: dim.h };
}

export function getContentArea(page: PageSettings): { x: number; y: number; w: number; h: number } {
  const { w, h } = getPageSize(page);
  return {
    x: page.margin.left,
    y: page.margin.top,
    w: w - page.margin.left - page.margin.right,
    h: h - page.margin.top - page.margin.bottom,
  };
}

// ─────────────────────────────────────────────────────────────
// Token Registry — per entity type
// ─────────────────────────────────────────────────────────────

export type TokenDef = {
  token: string;           // e.g. "report.number"
  label: string;           // e.g. "Report Number"
  group: string;           // e.g. "Report", "Project", "Workforce"
  description?: string;
};

export const TOKEN_REGISTRY: Record<string, TokenDef[]> = {
  daily_report: [
    // ── Report metadata ──
    { token: "report.number", label: "Report Number", group: "Report", description: "e.g. DSR-20260713" },
    { token: "report.date", label: "Report Date", group: "Report", description: "e.g. 13 Jul 2026" },
    { token: "report.weekday", label: "Day of Week", group: "Report", description: "e.g. Monday" },
    { token: "report.status", label: "Status", group: "Report", description: "draft / submitted / approved / archived" },
    { token: "report.prepared_by", label: "Prepared By (name)", group: "Report", description: "Name of the engineer who prepared the report" },
    { token: "report.preparer_role", label: "Preparer Role", group: "Report", description: "e.g. project_manager, engineer" },
    { token: "report.submitted_at", label: "Submitted At", group: "Report", description: "Date/time the report was submitted to client" },
    { token: "report.client_approved_at", label: "Client Approved At", group: "Report", description: "Date/time the client approved the report" },

    // ── Project ──
    { token: "project.name", label: "Project Name", group: "Project" },
    { token: "project.code", label: "Project Code", group: "Project", description: "Short alphanumeric code, e.g. NH-02" },
    { token: "project.client", label: "Client Name", group: "Project" },
    { token: "project.location", label: "Project Location", group: "Project" },

    // ── Weather ──
    { token: "weather.morning_condition", label: "Morning Condition", group: "Weather", description: "clear / cloudy / overcast / rain / fog / storm" },
    { token: "weather.afternoon_condition", label: "Afternoon Condition", group: "Weather" },
    { token: "weather.evening_condition", label: "Evening Condition", group: "Weather" },
    { token: "weather.max_temp_c", label: "Max Temperature (°C)", group: "Weather" },
    { token: "weather.min_temp_c", label: "Min Temperature (°C)", group: "Weather" },
    { token: "weather.rainfall_mm", label: "Rainfall (mm)", group: "Weather" },

    // ── Workforce KPIs ──
    { token: "workforce.total_headcount", label: "Total Headcount", group: "Workforce", description: "Sum of all crew headcounts" },
    { token: "workforce.crew_count", label: "Crew Count", group: "Workforce", description: "Number of distinct crew entries" },
    { token: "workforce.total_reg_hours", label: "Total Regular Hours", group: "Workforce" },
    { token: "workforce.total_ot_hours", label: "Total Overtime Hours", group: "Workforce" },

    // ── Equipment KPIs ──
    { token: "equipment.unit_count", label: "Equipment Unit Count", group: "Equipment" },
    { token: "equipment.total_working_hours", label: "Total Working Hours", group: "Equipment" },
    { token: "equipment.total_fuel_liters", label: "Total Fuel (Liters)", group: "Equipment" },

    // ── Progress KPIs ──
    { token: "progress.task_count", label: "Total Tasks", group: "Progress" },
    { token: "progress.tasks_done", label: "Tasks Completed", group: "Progress", description: "actual ≥ planned" },
    { token: "progress.tasks_partial", label: "Tasks Partially Done", group: "Progress", description: "0 < actual < planned" },
    { token: "progress.tasks_not_started", label: "Tasks Not Started", group: "Progress", description: "actual = 0, planned > 0" },

    // ── Materials ──
    { token: "materials.delivery_count", label: "Material Deliveries", group: "Materials", description: "Number of material received entries today" },

    // ── Notes ──
    { token: "notes.problems", label: "Problems / Issues", group: "Notes" },
    { token: "notes.safety", label: "Safety Notes", group: "Notes" },
    { token: "notes.remarks", label: "Remarks", group: "Notes" },

    // ── Meta ──
    { token: "meta.generated_datetime", label: "Generated At", group: "Meta", description: "When this PDF was generated" },
  ],

  // ─────────────────────────────────────────────────────────────
  // RFI (Request for Information)
  // ─────────────────────────────────────────────────────────────
  rfi: [
    { token: "rfi.number", label: "RFI Number", group: "RFI", description: "e.g. RFI-20260713-001" },
    { token: "rfi.subject", label: "Subject", group: "RFI" },
    { token: "rfi.description", label: "Description", group: "RFI" },
    { token: "rfi.location", label: "Location", group: "RFI", description: "e.g. Chainage 0+500" },
    { token: "rfi.status", label: "Status", group: "RFI", description: "draft / submitted / approved / rejected / closed" },
    { token: "rfi.priority", label: "Priority", group: "RFI", description: "low / normal / high / urgent" },
    { token: "rfi.discipline", label: "Discipline", group: "RFI", description: "civil / structural / electrical / etc." },
    { token: "rfi.work_date", label: "Work Date", group: "RFI" },
    { token: "rfi.submitted_at", label: "Submitted At", group: "RFI" },
    { token: "rfi.responded_at", label: "Responded At", group: "RFI" },
    { token: "rfi.created_by", label: "Created By", group: "RFI" },
    { token: "rfi.assigned_to", label: "Assigned To", group: "RFI" },
    { token: "rfi.cost_impact", label: "Has Cost Impact", group: "RFI", description: "Yes / No" },
    { token: "rfi.schedule_impact", label: "Has Schedule Impact", group: "RFI", description: "Yes / No" },
    { token: "rfi.subcontractor_name", label: "Subcontractor Name", group: "RFI" },
    { token: "rfi.subcontractor_contact", label: "Subcontractor Contact", group: "RFI" },
    { token: "rfi.subcontractor_phone", label: "Subcontractor Phone", group: "RFI" },
    { token: "rfi.gantt_task_code", label: "Linked Task Code", group: "RFI" },
    { token: "rfi.gantt_task_name", label: "Linked Task Name", group: "RFI" },
    { token: "rfi.boq_code", label: "Linked BOQ Code", group: "RFI" },
    { token: "rfi.boq_description", label: "Linked BOQ Description", group: "RFI" },
    { token: "rfi.drawing_number", label: "Drawing Number", group: "RFI" },
    { token: "rfi.drawing_title", label: "Drawing Title", group: "RFI" },
    { token: "rfi.items_count", label: "Number of Items", group: "RFI" },
    { token: "rfi.total_quantity", label: "Total Quantity (sum of items)", group: "RFI" },

    // Project
    { token: "project.name", label: "Project Name", group: "Project" },
    { token: "project.code", label: "Project Code", group: "Project" },
    { token: "project.client", label: "Client Name", group: "Project" },
    { token: "project.location", label: "Project Location", group: "Project" },

    // Meta
    { token: "meta.generated_datetime", label: "Generated At", group: "Meta" },
  ],

  // ─────────────────────────────────────────────────────────────
  // BOQ (Bill of Quantities)
  // ─────────────────────────────────────────────────────────────
  boq: [
    { token: "project.name", label: "Project Name", group: "Project" },
    { token: "project.code", label: "Project Code", group: "Project" },
    { token: "project.client", label: "Client Name", group: "Project" },
    { token: "project.location", label: "Project Location", group: "Project" },

    { token: "boq.total_items", label: "Total BOQ Items", group: "BOQ" },
    { token: "boq.total_amount", label: "Total Contract Value (NPR)", group: "BOQ" },
    { token: "boq.total_quantity", label: "Total Quantity (all items)", group: "BOQ" },
    { token: "boq.section_count", label: "Number of Sections", group: "BOQ" },
    { token: "boq.categories", label: "Categories (comma-separated)", group: "BOQ" },
    { token: "boq.generated_datetime", label: "Generated At", group: "BOQ" },
    { token: "boq.locked_status", label: "BOQ Locked Status", group: "BOQ", description: "Locked / Unlocked" },
  ],

  // ─────────────────────────────────────────────────────────────
  // IPC (Interim Payment Certificate)
  // ─────────────────────────────────────────────────────────────
  ipc: [
    { token: "ipc.number", label: "IPC Number", group: "IPC" },
    { token: "ipc.period", label: "Period", group: "IPC", description: "e.g. Jul 2026" },
    { token: "ipc.status", label: "Status", group: "IPC", description: "draft / submitted / certified / approved / paid" },
    { token: "ipc.issue_date", label: "Issue Date", group: "IPC" },
    { token: "ipc.gross_amount", label: "Gross Amount (NPR)", group: "IPC" },
    { token: "ipc.retention_percent", label: "Retention %", group: "IPC" },
    { token: "ipc.retention_amount", label: "Retention Amount (NPR)", group: "IPC" },
    { token: "ipc.advance_recovery", label: "Advance Recovery (NPR)", group: "IPC" },
    { token: "ipc.net_payable", label: "Net Payable (NPR)", group: "IPC" },
    { token: "ipc.items_count", label: "Number of Line Items", group: "IPC" },
    { token: "ipc.subcontractor_name", label: "Subcontractor Name", group: "IPC" },

    { token: "project.name", label: "Project Name", group: "Project" },
    { token: "project.code", label: "Project Code", group: "Project" },
    { token: "project.client", label: "Client Name", group: "Project" },

    { token: "meta.generated_datetime", label: "Generated At", group: "Meta" },
  ],

  // ─────────────────────────────────────────────────────────────
  // Schedule (Gantt)
  // ─────────────────────────────────────────────────────────────
  schedule: [
    { token: "schedule.version_name", label: "Version Name", group: "Schedule" },
    { token: "schedule.version_type", label: "Version Type", group: "Schedule", description: "PLANNING / EXECUTION" },
    { token: "schedule.status", label: "Status", group: "Schedule", description: "DRAFT / APPROVED / ARCHIVED" },
    { token: "schedule.task_count", label: "Total Tasks", group: "Schedule" },
    { token: "schedule.milestone_count", label: "Milestones", group: "Schedule" },
    { token: "schedule.start_date", label: "Project Start Date", group: "Schedule" },
    { token: "schedule.end_date", label: "Project End Date", group: "Schedule" },
    { token: "schedule.duration_days", label: "Total Duration (days)", group: "Schedule" },
    { token: "schedule.avg_progress", label: "Average Progress %", group: "Schedule" },
    { token: "schedule.critical_path_length", label: "Critical Path Length (days)", group: "Schedule" },

    { token: "project.name", label: "Project Name", group: "Project" },
    { token: "project.code", label: "Project Code", group: "Project" },
    { token: "project.client", label: "Client Name", group: "Project" },

    { token: "meta.generated_datetime", label: "Generated At", group: "Meta" },
  ],
};

/**
 * Backward-compatibility aliases — maps old token names to new ones.
 * Used by resolveTokens() so templates saved before the rename still work.
 */
const TOKEN_ALIASES: Record<string, string> = {
  "report.day_of_week": "report.weekday",
  "report.prepared_by_role": "report.preparer_role",
  "weather.morning": "weather.morning_condition",
  "weather.afternoon": "weather.afternoon_condition",
  "weather.evening": "weather.evening_condition",
  "weather.max_temp": "weather.max_temp_c",
  "weather.min_temp": "weather.min_temp_c",
  "weather.rainfall": "weather.rainfall_mm",
  "workforce.total": "workforce.total_headcount",
  "workforce.crews": "workforce.crew_count",
  "workforce.reg_hours": "workforce.total_reg_hours",
  "workforce.ot_hours": "workforce.total_ot_hours",
  "equipment.count": "equipment.unit_count",
  "equipment.working_hours": "equipment.total_working_hours",
  "equipment.fuel": "equipment.total_fuel_liters",
  "progress.total": "progress.task_count",
  "progress.done": "progress.tasks_done",
  "progress.partial": "progress.tasks_partial",
  "progress.not_started": "progress.tasks_not_started",
  "materials.count": "materials.delivery_count",
  "meta.generated_at": "meta.generated_datetime",
};

export function getTokensForEntity(entityType: string): TokenDef[] {
  return TOKEN_REGISTRY[entityType] ?? [];
}

// ─────────────────────────────────────────────────────────────
// Table Schemas — per entity
// ─────────────────────────────────────────────────────────────

export type TableColumn = {
  id: string;              // e.g. "company"
  label: string;           // e.g. "Company"
  width?: number;          // relative width (defaults to equal)
};

export const TABLE_SCHEMAS: Record<string, { entity: string; label: string; columns: TableColumn[] }> = {
  workforce: {
    entity: "workforce",
    label: "Workforce",
    columns: [
      { id: "company", label: "Company / Name" },
      { id: "trade", label: "Trade" },
      { id: "skill", label: "Skill" },
      { id: "headcount", label: "Count", width: 0.5 },
      { id: "regHours", label: "Reg Hrs", width: 0.5 },
      { id: "otHours", label: "OT Hrs", width: 0.5 },
      { id: "location", label: "Location" },
    ],
  },
  equipment: {
    entity: "equipment",
    label: "Equipment",
    columns: [
      { id: "id", label: "ID / Reg" },
      { id: "type", label: "Type" },
      { id: "ownership", label: "Own/Hire", width: 0.6 },
      { id: "workingHours", label: "Work", width: 0.4 },
      { id: "idleHours", label: "Idle", width: 0.4 },
      { id: "breakdownHours", label: "Brkdn", width: 0.4 },
      { id: "operator", label: "Operator" },
      { id: "fuel", label: "Fuel (L)", width: 0.4 },
    ],
  },
  progress: {
    entity: "progress",
    label: "Plan vs Actual",
    columns: [
      { id: "boqCode", label: "BOQ", width: 0.6 },
      { id: "boqDesc", label: "Task" },
      { id: "location", label: "Location" },
      { id: "plannedQty", label: "Plan", width: 0.4 },
      { id: "actualQty", label: "Actual", width: 0.4 },
      { id: "unit", label: "Unit", width: 0.4 },
    ],
  },
  materials: {
    entity: "materials",
    label: "Material Received",
    columns: [
      { id: "name", label: "Material" },
      { id: "qty", label: "Qty", width: 0.5 },
      { id: "unit", label: "Unit", width: 0.4 },
      { id: "supplier", label: "Supplier" },
      { id: "vehicleNo", label: "Vehicle" },
      { id: "testStatus", label: "Test", width: 0.5 },
    ],
  },
  visitors: {
    entity: "visitors",
    label: "Site Visitors",
    columns: [
      { id: "visitor", label: "Name" },
      { id: "organization", label: "Organization" },
      { id: "purpose", label: "Purpose" },
      { id: "timeIn", label: "In", width: 0.5 },
      { id: "timeOut", label: "Out", width: 0.5 },
    ],
  },
  meetings: {
    entity: "meetings",
    label: "Meetings",
    columns: [
      { id: "topic", label: "Topic" },
      { id: "attendees", label: "Attendees" },
      { id: "notes", label: "Notes" },
    ],
  },

  // ── RFI items ──
  rfi_items: {
    entity: "rfi_items",
    label: "RFI Line Items",
    columns: [
      { id: "boqCode", label: "BOQ Code", width: 0.7 },
      { id: "boqDesc", label: "Description" },
      { id: "quantity", label: "Qty", width: 0.5 },
      { id: "unit", label: "Unit", width: 0.4 },
      { id: "paymentType", label: "Payment", width: 0.6 },
    ],
  },

  // ── RFI responses ──
  rfi_responses: {
    entity: "rfi_responses",
    label: "RFI Responses",
    columns: [
      { id: "responder", label: "By" },
      { id: "decision", label: "Decision", width: 0.7 },
      { id: "response", label: "Response" },
      { id: "createdAt", label: "Date", width: 0.7 },
    ],
  },

  // ── BOQ items ──
  boq_items: {
    entity: "boq_items",
    label: "BOQ Items",
    columns: [
      { id: "code", label: "Code", width: 0.6 },
      { id: "description", label: "Description" },
      { id: "unit", label: "Unit", width: 0.4 },
      { id: "quantity", label: "Qty", width: 0.5 },
      { id: "rate", label: "Rate", width: 0.6 },
      { id: "amount", label: "Amount", width: 0.7 },
    ],
  },

  // ── IPC items ──
  ipc_items: {
    entity: "ipc_items",
    label: "IPC Line Items",
    columns: [
      { id: "boqCode", label: "BOQ", width: 0.6 },
      { id: "description", label: "Description" },
      { id: "unit", label: "Unit", width: 0.4 },
      { id: "thisQty", label: "This Period", width: 0.6 },
      { id: "cumQty", label: "Cumulative", width: 0.6 },
      { id: "rate", label: "Rate", width: 0.5 },
      { id: "amount", label: "Amount", width: 0.7 },
    ],
  },

  // ── Schedule tasks ──
  schedule_tasks: {
    entity: "schedule_tasks",
    label: "Schedule Tasks",
    columns: [
      { id: "code", label: "WBS", width: 0.6 },
      { id: "name", label: "Task Name" },
      { id: "startDate", label: "Start", width: 0.7 },
      { id: "endDate", label: "End", width: 0.7 },
      { id: "duration", label: "Days", width: 0.4 },
      { id: "progress", label: "%", width: 0.4 },
    ],
  },
};

export function getTableSchema(entity: string): { entity: string; label: string; columns: TableColumn[] } | undefined {
  return TABLE_SCHEMAS[entity];
}

export function getTableEntitiesForEntity(entityType: string): string[] {
  switch (entityType) {
    case "daily_report":
      return ["workforce", "equipment", "progress", "materials", "visitors", "meetings"];
    case "rfi":
      return ["rfi_items", "rfi_responses"];
    case "boq":
      return ["boq_items"];
    case "ipc":
      return ["ipc_items"];
    case "schedule":
      return ["schedule_tasks"];
    default:
      return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Token resolution — given a report object, resolve {{tokens}}
// ─────────────────────────────────────────────────────────────

function parseJsonArray(value: string | null | undefined): any[] {
  if (!value) return [];
  try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; }
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

/**
 * Build the token context for a given entity (currently only daily_report).
 * Returns a flat Record<string, string> of token → resolved value.
 */
export function buildTokenContext(entityType: string, data: any): Record<string, string> {
  if (entityType === "daily_report") {
    const report = data?.report;
    if (!report) return {};
    const project = report.project ?? data?.project ?? {};
    const workforce = parseJsonArray(report.workforce);
    const equipment = parseJsonArray(report.equipmentUsed);
    const progress = parseJsonArray(report.workProgress);
    const materials = parseJsonArray(report.materialReceived);

    const totalWorkforce = workforce.reduce((s, w) => s + (Number(w.headcount) || 0), 0);
    const totalRegHours = workforce.reduce((s, w) => s + (Number(w.regHours) || 0), 0);
    const totalOtHours = workforce.reduce((s, w) => s + (Number(w.otHours) || 0), 0);
    const totalEquipHours = equipment.reduce((s, e) => s + (Number(e.workingHours) || 0), 0);
    const totalFuel = equipment.reduce((s, e) => s + (Number(e.fuel) || 0), 0);
    const tasksDone = progress.filter(p => (Number(p.actualQty) || 0) >= (Number(p.plannedQty) || 0) && (Number(p.actualQty) || 0) > 0).length;
    const tasksPartial = progress.filter(p => (Number(p.actualQty) || 0) > 0 && (Number(p.actualQty) || 0) < (Number(p.plannedQty) || 0)).length;
    const tasksNotStarted = progress.filter(p => (Number(p.actualQty) || 0) === 0 && (Number(p.plannedQty) || 0) > 0).length;

    return {
      "report.number": report.number ?? "—",
      "report.date": fmtDate(report.reportDate),
      "report.weekday": report.dayOfWeek ?? "—",
      "report.status": report.status ?? "—",
      "report.prepared_by": report.createdBy?.name ?? "—",
      "report.preparer_role": report.createdBy?.role?.replace("_", " ") ?? "—",
      "report.submitted_at": report.submittedAt ? fmtDateTime(report.submittedAt) : "Not submitted",
      "report.client_approved_at": report.clientApprovedAt ? fmtDateTime(report.clientApprovedAt) : "Pending",

      "project.name": project.name ?? "—",
      "project.code": project.code ?? "—",
      "project.client": project.client ?? "—",
      "project.location": project.location ?? "—",

      "weather.morning_condition": report.weatherMorning ?? "—",
      "weather.afternoon_condition": report.weatherAfternoon ?? "—",
      "weather.evening_condition": report.weatherEvening ?? "—",
      "weather.max_temp_c": report.maxTempC?.toString() ?? "—",
      "weather.min_temp_c": report.minTempC?.toString() ?? "—",
      "weather.rainfall_mm": report.rainfallMm?.toString() ?? "—",

      "workforce.total_headcount": totalWorkforce.toString(),
      "workforce.crew_count": workforce.length.toString(),
      "workforce.total_reg_hours": totalRegHours.toString(),
      "workforce.total_ot_hours": totalOtHours.toString(),

      "equipment.unit_count": equipment.length.toString(),
      "equipment.total_working_hours": totalEquipHours.toFixed(1),
      "equipment.total_fuel_liters": totalFuel.toFixed(0),

      "progress.task_count": progress.length.toString(),
      "progress.tasks_done": tasksDone.toString(),
      "progress.tasks_partial": tasksPartial.toString(),
      "progress.tasks_not_started": tasksNotStarted.toString(),

      "materials.delivery_count": materials.length.toString(),

      "notes.problems": report.problems ?? "—",
      "notes.safety": report.safetyNotes ?? "—",
      "notes.remarks": report.remarks ?? "—",

      "meta.generated_datetime": fmtDateTime(new Date()),
    };
  }

  if (entityType === "rfi") {
    const rfi = data?.rfi ?? data;
    if (!rfi) return {};
    const project = rfi.project ?? data?.project ?? {};
    const items = rfi.items ?? [];
    const totalQty = items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);

    return {
      "rfi.number": rfi.number ?? "—",
      "rfi.subject": rfi.subject ?? "—",
      "rfi.description": rfi.description ?? "—",
      "rfi.location": rfi.location ?? "—",
      "rfi.status": rfi.status ?? "—",
      "rfi.priority": rfi.priority ?? "—",
      "rfi.discipline": rfi.discipline ?? "—",
      "rfi.work_date": rfi.workDate ? fmtDate(rfi.workDate) : "—",
      "rfi.submitted_at": rfi.submittedAt ? fmtDateTime(rfi.submittedAt) : "Not submitted",
      "rfi.responded_at": rfi.respondedAt ? fmtDateTime(rfi.respondedAt) : "Pending",
      "rfi.created_by": rfi.createdBy?.name ?? "—",
      "rfi.assigned_to": rfi.assignedTo?.user?.name ?? "—",
      "rfi.cost_impact": rfi.costImpact ? "Yes" : "No",
      "rfi.schedule_impact": rfi.scheduleImpact ? "Yes" : "No",
      "rfi.subcontractor_name": rfi.subcontractor?.name ?? "—",
      "rfi.subcontractor_contact": rfi.subcontractor?.contact ?? "—",
      "rfi.subcontractor_phone": rfi.subcontractor?.phone ?? "—",
      "rfi.gantt_task_code": rfi.ganttTask?.code ?? "—",
      "rfi.gantt_task_name": rfi.ganttTask?.name ?? "—",
      "rfi.boq_code": rfi.boqItem?.code ?? "—",
      "rfi.boq_description": rfi.boqItem?.description ?? "—",
      "rfi.drawing_number": rfi.drawing?.number ?? "—",
      "rfi.drawing_title": rfi.drawing?.title ?? "—",
      "rfi.items_count": items.length.toString(),
      "rfi.total_quantity": totalQty.toString(),

      "project.name": project.name ?? "—",
      "project.code": project.code ?? "—",
      "project.client": project.client ?? "—",
      "project.location": project.location ?? "—",

      "meta.generated_datetime": fmtDateTime(new Date()),
    };
  }

  if (entityType === "boq") {
    const project = data?.project ?? {};
    const items = data?.items ?? [];
    const totalAmount = items.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
    const totalQty = items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
    const sections = new Set(items.map((i: any) => i.section).filter(Boolean));
    const categories = new Set(items.map((i: any) => i.category).filter(Boolean));

    return {
      "project.name": project.name ?? "—",
      "project.code": project.code ?? "—",
      "project.client": project.client ?? "—",
      "project.location": project.location ?? "—",

      "boq.total_items": items.length.toString(),
      "boq.total_amount": totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
      "boq.total_quantity": totalQty.toFixed(2),
      "boq.section_count": sections.size.toString(),
      "boq.categories": Array.from(categories).join(", "),
      "boq.generated_datetime": fmtDateTime(new Date()),
      "boq.locked_status": data?.boqLocked ? "Locked" : "Unlocked",
    };
  }

  if (entityType === "ipc") {
    const ipc = data?.ipc ?? data;
    if (!ipc) return {};
    const project = ipc.project ?? data?.project ?? {};
    const items = ipc.items ?? [];

    return {
      "ipc.number": ipc.number ?? "—",
      "ipc.period": ipc.period ?? "—",
      "ipc.status": ipc.status ?? "—",
      "ipc.issue_date": ipc.issueDate ? fmtDate(ipc.issueDate) : "—",
      "ipc.gross_amount": (ipc.grossAmount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }),
      "ipc.retention_percent": (ipc.retention ?? 0).toString() + "%",
      "ipc.retention_amount": (ipc.retentionAmount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }),
      "ipc.advance_recovery": (ipc.advanceRecovery ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }),
      "ipc.net_payable": (ipc.netPayable ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }),
      "ipc.items_count": items.length.toString(),
      "ipc.subcontractor_name": ipc.subcontractor?.name ?? "—",

      "project.name": project.name ?? "—",
      "project.code": project.code ?? "—",
      "project.client": project.client ?? "—",

      "meta.generated_datetime": fmtDateTime(new Date()),
    };
  }

  if (entityType === "schedule") {
    const version = data?.version ?? data;
    if (!version) return {};
    const project = version.project ?? data?.project ?? {};
    const tasks = version.tasks ?? [];
    const milestones = tasks.filter((t: any) => t.isMilestone);
    const startDate = tasks.length > 0
      ? tasks.reduce((min: Date, t: any) => t.startDate && new Date(t.startDate) < min ? new Date(t.startDate) : min, new Date(tasks[0].startDate))
      : null;
    const endDate = tasks.length > 0
      ? tasks.reduce((max: Date, t: any) => t.endDate && new Date(t.endDate) > max ? new Date(t.endDate) : max, new Date(tasks[0].endDate))
      : null;
    const avgProgress = tasks.length > 0
      ? Math.round(tasks.reduce((s: number, t: any) => s + (Number(t.progress) || 0), 0) / tasks.length)
      : 0;
    const durationDays = startDate && endDate
      ? Math.round((endDate.getTime() - startDate.getTime()) / 86400000)
      : 0;

    return {
      "schedule.version_name": version.name ?? "—",
      "schedule.version_type": version.scheduleType ?? "—",
      "schedule.status": version.status ?? "—",
      "schedule.task_count": tasks.length.toString(),
      "schedule.milestone_count": milestones.length.toString(),
      "schedule.start_date": startDate ? fmtDate(startDate) : "—",
      "schedule.end_date": endDate ? fmtDate(endDate) : "—",
      "schedule.duration_days": durationDays.toString(),
      "schedule.avg_progress": avgProgress.toString() + "%",
      "schedule.critical_path_length": "—", // requires critical path calc; placeholder

      "project.name": project.name ?? "—",
      "project.code": project.code ?? "—",
      "project.client": project.client ?? "—",

      "meta.generated_datetime": fmtDateTime(new Date()),
    };
  }

  return {};
}

/**
 * Resolve {{tokens}} in a text string using a token context.
 * Unknown tokens are left as-is (so typos are visible).
 * Also resolves legacy token names via TOKEN_ALIASES for backward compatibility.
 */
export function resolveTokens(text: string, ctx: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, token) => {
    const t = token.trim();
    // Direct match
    if (ctx[t] != null) return ctx[t];
    // Try alias (legacy token name → new name)
    const aliased = TOKEN_ALIASES[t];
    if (aliased && ctx[aliased] != null) return ctx[aliased];
    // Unknown — leave as-is so the user sees the typo
    return match;
  });
}

/**
 * Get the rows for a table entity from the report data.
 * Handles all entity types — each pulls from the appropriate data shape.
 */
export function getTableRows(entity: string, data: any): any[] {
  // Daily report tables
  const report = data?.report ?? data;
  switch (entity) {
    case "workforce": return parseJsonArray(report.workforce);
    case "equipment": return parseJsonArray(report.equipmentUsed);
    case "progress": return parseJsonArray(report.workProgress);
    case "materials": return parseJsonArray(report.materialReceived);
    case "visitors": return parseJsonArray(report.siteVisits);
    case "meetings": return parseJsonArray(report.meetings);
  }

  // RFI tables
  const rfi = data?.rfi ?? data;
  switch (entity) {
    case "rfi_items":
      return (rfi.items ?? []).map((i: any) => ({
        boqCode: i.boqCode ?? i.boqItem?.code ?? "—",
        boqDesc: i.boqDesc ?? i.boqItem?.description ?? "—",
        quantity: i.quantity ?? 0,
        unit: i.unit ?? i.boqItem?.unit ?? "—",
        paymentType: i.paymentType ?? "—",
      }));
    case "rfi_responses":
      return (rfi.responses ?? []).map((r: any) => ({
        responder: r.responder?.name ?? "—",
        decision: r.decision ?? "—",
        response: r.response ?? "—",
        createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—",
      }));
  }

  // BOQ items
  if (entity === "boq_items") {
    return (data?.items ?? []).map((i: any) => ({
      code: i.code ?? "—",
      description: i.description ?? "—",
      unit: i.unit ?? "—",
      quantity: i.quantity ?? 0,
      rate: (i.rate ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }),
      amount: (i.amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }),
    }));
  }

  // IPC items
  if (entity === "ipc_items") {
    const ipc = data?.ipc ?? data;
    return (ipc.items ?? []).map((i: any) => ({
      boqCode: i.boqCode ?? "—",
      description: i.description ?? "—",
      unit: i.unit ?? "—",
      thisQty: i.thisQty ?? 0,
      cumQty: i.cumQty ?? 0,
      rate: (i.rate ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }),
      amount: (i.amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }),
    }));
  }

  // Schedule tasks
  if (entity === "schedule_tasks") {
    const version = data?.version ?? data;
    return (version.tasks ?? []).map((t: any) => ({
      code: t.code ?? "—",
      name: t.name ?? "—",
      startDate: t.startDate ? new Date(t.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—",
      endDate: t.endDate ? new Date(t.endDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—",
      duration: t.duration ?? 0,
      progress: Math.round(t.progress ?? 0) + "%",
    }));
  }

  return [];
}

// ─────────────────────────────────────────────────────────────
// Default layout & helpers
// ─────────────────────────────────────────────────────────────

let cellIdCounter = 0;
export function genCellId(): string {
  cellIdCounter += 1;
  return `cell_${Date.now().toString(36)}_${cellIdCounter}`;
}

export const DEFAULT_LAYOUT: ReportLayout = {
  page: {
    paper: "A4",
    orientation: "portrait",
    margin: { top: 15, right: 15, bottom: 15, left: 15 },
  },
  cells: [],
};

/**
 * A sensible starter layout for daily reports — used when the user clicks
 * "Start with a template" and no saved template is picked.
 */
export function starterLayoutDailyReport(): ReportLayout {
  const layout: ReportLayout = {
    page: { ...DEFAULT_LAYOUT.page },
    cells: [],
  };

  // Title
  layout.cells.push({
    id: genCellId(),
    type: "text",
    x: 15, y: 15, w: 180, h: 12,
    content: { type: "text", text: "Daily Site Report — {{report.number}}" } as TextContent,
    style: { fontSize: 16, bold: true, color: "#4a8b57", align: "left", valign: "middle" },
  });

  // Meta line
  layout.cells.push({
    id: genCellId(),
    type: "text",
    x: 15, y: 28, w: 180, h: 6,
    content: { type: "text", text: "{{project.code}} — {{project.name}}    |    {{report.date}} ({{report.weekday}})" } as TextContent,
    style: { fontSize: 9, color: "#6b7280", align: "left", valign: "middle" },
  });

  // Divider
  layout.cells.push({
    id: genCellId(),
    type: "divider",
    x: 15, y: 36, w: 180, h: 1,
    content: { type: "divider", orientation: "horizontal", thickness: 2 } as DividerContent,
    style: { color: "#4a8b57" },
  });

  // KPI row — 4 cards
  const kpiW = 42;
  const kpiY = 42;
  const kpiH = 22;
  const kpiGap = 4;
  const kpiStartX = 15;
  const kpis = [
    { metric: "workforce.total_headcount", label: "Workforce" },
    { metric: "equipment.unit_count", label: "Equipment" },
    { metric: "progress.tasks_done", label: "Tasks Done" },
    { metric: "materials.delivery_count", label: "Materials" },
  ];
  kpis.forEach((kpi, i) => {
    layout.cells.push({
      id: genCellId(),
      type: "kpi",
      x: kpiStartX + i * (kpiW + kpiGap), y: kpiY, w: kpiW, h: kpiH,
      content: { type: "kpi", metric: kpi.metric, label: kpi.label, format: "number" } as KpiContent,
      style: { border: "all", borderColor: "#d1d5db", borderRadius: 3, padding: 4, align: "center", valign: "middle" },
    });
  });

  // Weather section header
  layout.cells.push({
    id: genCellId(),
    type: "text",
    x: 15, y: 70, w: 180, h: 8,
    content: { type: "text", text: "Weather" } as TextContent,
    style: { fontSize: 11, bold: true, color: "#4a8b57", align: "left", valign: "middle", border: "bottom", borderColor: "#d1d5db", borderWidth: 1 },
  });

  // Weather text
  layout.cells.push({
    id: genCellId(),
    type: "text",
    x: 15, y: 80, w: 180, h: 8,
    content: { type: "text", text: "Morning: {{weather.morning_condition}}  |  Afternoon: {{weather.afternoon_condition}}  |  Evening: {{weather.evening_condition}}    Temp: {{weather.min_temp_c}} – {{weather.max_temp_c}} °C    Rain: {{weather.rainfall_mm}} mm" } as TextContent,
    style: { fontSize: 9, align: "left", valign: "middle" },
  });

  // Workforce table
  layout.cells.push({
    id: genCellId(),
    type: "text",
    x: 15, y: 92, w: 180, h: 8,
    content: { type: "text", text: "Workforce" } as TextContent,
    style: { fontSize: 11, bold: true, color: "#4a8b57", align: "left", valign: "middle", border: "bottom", borderColor: "#d1d5db", borderWidth: 1 },
  });
  layout.cells.push({
    id: genCellId(),
    type: "table",
    x: 15, y: 102, w: 180, h: 40,
    content: { type: "table", entity: "workforce", columns: ["company", "trade", "skill", "headcount", "regHours", "otHours", "location"], showHeader: true, zebra: true } as TableContent,
    style: { fontSize: 8, border: "all", borderColor: "#d1d5db", borderWidth: 1 },
  });

  // Signature row
  const sigW = 55;
  const sigGap = 7;
  const sigStartX = 15 + (180 - 3 * sigW - 2 * sigGap) / 2;
  const sigY = 240;
  const sigs = [
    { role: "prepared" as const, label: "Prepared by" },
    { role: "submitted" as const, label: "Submitted to Client" },
    { role: "approved" as const, label: "Client Approved" },
  ];
  sigs.forEach((sig, i) => {
    layout.cells.push({
      id: genCellId(),
      type: "signature",
      x: sigStartX + i * (sigW + sigGap), y: sigY, w: sigW, h: 30,
      content: { type: "signature", role: sig.role } as SignatureContent,
      style: { border: "all", borderColor: "#9ca3af", borderWidth: 1, borderRadius: 2, padding: 4, align: "center", valign: "middle" },
    });
  });

  return layout;
}

/**
 * A sensible starter layout for schedule / Gantt chart headers
 * designed for A3 Landscape by default.
 */
export function starterLayoutSchedule(): ReportLayout {
  const layout: ReportLayout = {
    page: {
      paper: "A3",
      orientation: "landscape",
      margin: { top: 15, right: 15, bottom: 15, left: 15 },
    },
    cells: [],
  };

  // Logo / Image placeholder on the left
  layout.cells.push({
    id: genCellId(),
    type: "image",
    x: 15, y: 15, w: 60, h: 25,
    content: { type: "image", src: "" } as any,
    style: { border: "all", borderColor: "#cbd5e1", borderWidth: 1, padding: 4 },
  });

  // Project title and Version in the center
  layout.cells.push({
    id: genCellId(),
    type: "text",
    x: 85, y: 15, w: 220, h: 12,
    content: { type: "text", text: "{{project.name}}" } as TextContent,
    style: { fontSize: 18, bold: true, color: "#0f172a", align: "center", valign: "middle" },
  });

  layout.cells.push({
    id: genCellId(),
    type: "text",
    x: 85, y: 28, w: 220, h: 8,
    content: { type: "text", text: "Schedule: {{schedule.version_name}} ({{schedule.version_type}})" } as TextContent,
    style: { fontSize: 11, italic: true, color: "#475569", align: "center", valign: "middle" },
  });

  // Schedule Info on the right
  layout.cells.push({
    id: genCellId(),
    type: "text",
    x: 315, y: 15, w: 90, h: 25,
    content: { type: "text", text: "Code: {{project.code}}\nTasks: {{schedule.task_count}}\nPrinted: {{meta.generated_datetime}}" } as TextContent,
    style: { fontSize: 9, color: "#334155", align: "right", valign: "middle" },
  });

  // Horizontal divider line
  layout.cells.push({
    id: genCellId(),
    type: "divider",
    x: 15, y: 44, w: 390, h: 1,
    content: { type: "divider", orientation: "horizontal", thickness: 2 } as DividerContent,
    style: { color: "#475569" },
  });

  return layout;
}

