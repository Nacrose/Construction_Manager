// @ts-nocheck
"use client";

import { use, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

function parseJsonArray(value: string | any[] | null | undefined): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

const WEATHER_LABEL: Record<string, string> = {
  clear: "Clear",
  cloudy: "Cloudy",
  overcast: "Overcast",
  rain: "Rain",
  fog: "Fog",
  storm: "Storm",
};

// Sections that can be toggled on/off
const ALL_SECTIONS = [
  "summary", "weather", "workforce", "equipment", "progress",
  "materials", "visitors", "meetings", "problems", "safety",
  "remarks", "stamps",
] as const;
type SectionId = typeof ALL_SECTIONS[number];

type Template = "standard" | "government" | "minimal" | "detailed";

// Read query params safely on client
function useQueryParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }
  return new URLSearchParams(window.location.search);
}

export default function ReportPrintPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = use(params);
  const searchParams = useQueryParams();

  // Parse query params with defaults
  const template = (searchParams.get("template") as Template) || "standard";
  const enabledSections = useMemo(() => {
    const s = searchParams.get("sections");
    if (!s) return new Set<SectionId>(ALL_SECTIONS);
    const arr = s.split(",").filter(Boolean) as SectionId[];
    return new Set(arr.length > 0 ? arr : ALL_SECTIONS);
  }, [searchParams]);

  const paperSize = searchParams.get("paper") || "A4";
  const orientation = searchParams.get("orientation") || "portrait";
  const watermark = searchParams.get("watermark") || "";
  const watermarkColor = searchParams.get("wmColor") || "#f3f4f6";
  const headerNote = searchParams.get("headerNote") || "";
  const footerNote = searchParams.get("footerNote") || "";
  const logoDataUrl = searchParams.get("logo") || "";
  const includeCover = searchParams.get("cover") === "1";
  const fontFamily = searchParams.get("font") || "system";
  const accentColor = searchParams.get("accent") || "#4a8b57";

  const { data, isLoading } = trpc.workflow.dailyReport.getReport.useQuery({ reportId });
  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  const report = data?.report;
  const project = projectInfo?.project;

  // Auto-trigger print dialog once content is loaded
  useEffect(() => {
    if (!isLoading && report) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [isLoading, report?.id]);

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!report) {
    return <div className="p-8 text-center text-sm">Report not found.</div>;
  }

  const workforce = parseJsonArray(report.workforce);
  const equipment = parseJsonArray(report.equipmentUsed);
  const materials = parseJsonArray(report.materialReceived);
  const progress = parseJsonArray(report.workProgress);
  const visitors = parseJsonArray(report.siteVisits);
  const meetings = parseJsonArray(report.meetings);

  const totalWorkforce = workforce.reduce((s, w) => s + (Number(w.headcount) || 0), 0);
  const totalRegHours = workforce.reduce((s, w) => s + (Number(w.regHours) || 0), 0);
  const totalOtHours = workforce.reduce((s, w) => s + (Number(w.otHours) || 0), 0);
  const totalEquipHours = equipment.reduce((s, e) => s + (Number(e.workingHours) || 0), 0);
  const totalFuel = equipment.reduce((s, e) => s + (Number(e.fuel) || 0), 0);

  const tasksDone = progress.filter(p => (Number(p.actualQty) || 0) >= (Number(p.plannedQty) || 0) && (Number(p.actualQty) || 0) > 0).length;
  const tasksPartial = progress.filter(p => (Number(p.actualQty) || 0) > 0 && (Number(p.actualQty) || 0) < (Number(p.plannedQty) || 0)).length;
  const tasksNotStarted = progress.filter(p => (Number(p.actualQty) || 0) === 0 && (Number(p.plannedQty) || 0) > 0).length;

  const has = (id: SectionId) => enabledSections.has(id);

  // Paper size mapping
  const paperSizeMap: Record<string, string> = {
    A4: "A4",
    A3: "A3",
    Letter: "Letter",
    Legal: "Legal",
  };
  const pageSize = paperSizeMap[paperSize] || "A4";

  // Font family mapping
  const fontMap: Record<string, string> = {
    system: '-apple-system, "Segoe UI", Roboto, sans-serif',
    serif: '"Times New Roman", Georgia, serif',
    "sans-serif": 'Arial, Helvetica, sans-serif',
  };
  const fontFamilyValue = fontMap[fontFamily] || fontMap.system;

  // Template-specific styling
  const templateConfig = {
    standard: {
      headerColor: accentColor,
      headerBg: "transparent",
      headerText: accentColor,
      tableHeaderBg: "#f9fafb",
      borderColor: "#d1d5db",
      sectionTitleColor: accentColor,
      sectionTitleUppercase: true,
      padding: "14mm",
    },
    government: {
      headerColor: "#1e3a8a",
      headerBg: "#eff6ff",
      headerText: "#1e3a8a",
      tableHeaderBg: "#dbeafe",
      borderColor: "#1e40af",
      sectionTitleColor: "#1e3a8a",
      sectionTitleUppercase: true,
      padding: "18mm 20mm",
    },
    minimal: {
      headerColor: "#111827",
      headerBg: "transparent",
      headerText: "#111827",
      tableHeaderBg: "#f3f4f6",
      borderColor: "#e5e7eb",
      sectionTitleColor: "#374151",
      sectionTitleUppercase: false,
      padding: "12mm",
    },
    detailed: {
      headerColor: accentColor,
      headerBg: "transparent",
      headerText: accentColor,
      tableHeaderBg: "#f9fafb",
      borderColor: "#d1d5db",
      sectionTitleColor: accentColor,
      sectionTitleUppercase: true,
      padding: "14mm",
    },
  };
  const cfg = templateConfig[template];

  return (
    <div className="print-root" data-template={template}>
      <style>{`
        @page { margin: 0; size: ${pageSize} ${orientation}; }
        html, body { margin: 0; padding: 0; }
        body {
          font-family: ${fontFamilyValue};
          color: #111827;
          font-size: 10pt;
          line-height: 1.4;
        }
        .print-root { padding: ${cfg.padding}; }
        .page-break { page-break-after: always; }

        /* Header */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid ${cfg.headerColor};
          padding-bottom: 12px;
          margin-bottom: 16px;
          ${template === "government" ? `background: ${cfg.headerBg}; padding: 12px; border: 1px solid ${cfg.headerColor}; border-radius: 4px;` : ""}
        }
        .header-left { display: flex; gap: 12px; align-items: flex-start; }
        .header-logo { max-height: 60px; max-width: 180px; object-fit: contain; }
        .header h1 { font-size: 16pt; color: ${cfg.headerText}; margin: 0 0 4px; }
        .header .project { font-size: 10pt; color: #4b5563; }
        .header .meta { text-align: right; font-size: 9pt; color: #4b5563; }
        .meta-row { margin-bottom: 2px; }
        .meta-row strong { color: #111827; }

        .header-note {
          background: #fef3c7;
          border-left: 3px solid #f59e0b;
          padding: 6px 10px;
          font-size: 9pt;
          margin-bottom: 12px;
          border-radius: 2px;
        }

        /* Cover page */
        .cover {
          min-height: calc(100vh - 60mm);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          page-break-after: always;
          padding: 30mm 0;
        }
        .cover h1 { font-size: 28pt; color: ${cfg.headerText}; margin: 0 0 12px; }
        .cover h2 { font-size: 16pt; color: #4b5563; font-weight: 400; margin: 0 0 24px; }
        .cover .cover-meta { font-size: 11pt; color: #6b7280; line-height: 1.8; }
        .cover .cover-meta strong { color: #111827; }
        .cover .cover-logo { max-height: 100px; max-width: 240px; margin-bottom: 30px; object-fit: contain; }

        /* Summary cards */
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
        .summary .card { border: 1px solid ${cfg.borderColor}; border-radius: 4px; padding: 8px 10px; ${template === "minimal" ? "background: #fafafa;" : ""} }
        .summary .card .label { font-size: 7pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
        .summary .card .value { font-size: 14pt; font-weight: 600; color: ${cfg.headerColor}; margin-top: 2px; }
        .summary .card .sub { font-size: 7pt; color: #6b7280; margin-top: 2px; }

        /* Sections */
        .section { margin-bottom: 14px; page-break-inside: avoid; }
        .section h2 {
          font-size: ${template === "minimal" ? "11pt" : "10pt"};
          color: ${cfg.sectionTitleColor};
          border-bottom: 1px solid ${cfg.borderColor};
          padding-bottom: 3px;
          margin-bottom: 8px;
          ${cfg.sectionTitleUppercase ? "text-transform: uppercase; letter-spacing: 0.04em;" : ""}
          ${template === "government" ? `background: ${cfg.tableHeaderBg}; padding: 4px 8px; border: 1px solid ${cfg.borderColor}; border-radius: 2px;` : ""}
        }

        /* Tables */
        table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
        th, td { border: 1px solid ${cfg.borderColor}; padding: 3px 5px; text-align: left; vertical-align: top; }
        th { background: ${cfg.tableHeaderBg}; font-weight: 600; color: #374151; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .center { text-align: center; }
        tr:nth-child(even) td { ${template === "detailed" ? "background: #fafbfc;" : ""} }

        /* Weather */
        .weather-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 6px; }
        .weather-cell { border: 1px solid ${cfg.borderColor}; padding: 4px 6px; border-radius: 3px; }
        .weather-cell .lbl { font-size: 7pt; color: #6b7280; text-transform: uppercase; }
        .weather-cell .val { font-size: 10pt; font-weight: 500; }

        /* Notes */
        .notes { white-space: pre-wrap; font-size: 9pt; padding: 8px 10px; background: ${template === "minimal" ? "#fafafa" : "#f9fafb"}; border-radius: 3px; min-height: 30px; border: 1px solid ${cfg.borderColor}; }
        .empty { color: #9ca3af; font-style: italic; font-size: 8pt; }
        .progress-bar { display: inline-block; height: 8px; background: #e5e7eb; border-radius: 2px; min-width: 50px; vertical-align: middle; margin-right: 4px; }
        .progress-fill { display: inline-block; height: 8px; background: ${accentColor}; border-radius: 2px; }

        /* Signatures */
        .stamp-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 30px; padding-top: 16px; border-top: 1px dashed #9ca3af; }
        .stamp { text-align: center; min-height: 70px; }
        .stamp .role { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
        .stamp .box { border: 1px dashed #9ca3af; min-height: 60px; display: flex; align-items: center; justify-content: center; font-size: 8pt; color: #9ca3af; padding: 6px; }

        /* Watermark */
        .watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-30deg);
          font-size: 90pt;
          font-weight: 800;
          color: ${watermarkColor};
          opacity: 0.6;
          z-index: 0;
          pointer-events: none;
          letter-spacing: 0.1em;
        }
        .content { position: relative; z-index: 1; }

        /* Footer */
        .footer {
          margin-top: 24px;
          padding-top: 8px;
          border-top: 1px solid ${cfg.borderColor};
          font-size: 8pt;
          color: #6b7280;
          text-align: center;
        }
        .footer-note {
          background: #f0fdf4;
          border: 1px solid #d9efd9;
          padding: 6px 10px;
          font-size: 9pt;
          margin-top: 12px;
          border-radius: 3px;
          text-align: center;
        }

        /* Toolbar (screen only) */
        .toolbar { position: fixed; top: 8px; right: 8px; display: flex; gap: 6px; z-index: 100; }
        .toolbar button { padding: 4px 10px; font-size: 9pt; border: 1px solid #d1d5db; background: white; border-radius: 3px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .toolbar button:hover { background: #f9fafb; }
        @media print { .toolbar { display: none !important; } .print-root { padding: 0 !important; } }

        .print-root { max-width: 800px; margin: 0 auto; padding: 16px; }
        @media print { .print-root { max-width: none; padding: 0; } }
      `}</style>

      <div className="toolbar">
        <button onClick={() => window.print()}>Print / Save PDF</button>
        <button onClick={() => window.close()}>Close</button>
      </div>

      {watermark && <div className="watermark">{watermark}</div>}

      <div className="content">
        {/* Cover page */}
        {includeCover && (
          <div className="cover">
            {logoDataUrl && <img src={logoDataUrl} alt="logo" className="cover-logo" />}
            <h1>Daily Site Report</h1>
            <h2>{report.number}</h2>
            <div className="cover-meta">
              <div><strong>Project:</strong> {project?.code} — {project?.name}</div>
              {project?.client && <div><strong>Client:</strong> {project.client}</div>}
              <div><strong>Date:</strong> {format(new Date(report.reportDate), "dd MMMM yyyy")} ({report.dayOfWeek})</div>
              <div><strong>Prepared by:</strong> {report.createdBy.name}</div>
              <div><strong>Status:</strong> {report.status}</div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="header">
          <div className="header-left">
            {logoDataUrl && <img src={logoDataUrl} alt="logo" className="header-logo" />}
            <div>
              <h1>Daily Site Report</h1>
              <div className="project">{project?.code} — {project?.name}</div>
              {project?.client && <div className="project">Client: {project.client}</div>}
            </div>
          </div>
          <div className="meta">
            <div className="meta-row"><strong>Report No:</strong> {report.number}</div>
            <div className="meta-row"><strong>Date:</strong> {format(new Date(report.reportDate), "dd MMMM yyyy")} ({report.dayOfWeek})</div>
            <div className="meta-row"><strong>Status:</strong> {report.status}</div>
            <div className="meta-row"><strong>Prepared by:</strong> {report.createdBy.name}</div>
          </div>
        </div>

        {/* Header note */}
        {headerNote && <div className="header-note">{headerNote}</div>}

        {/* Summary */}
        {has("summary") && (
          <div className="summary">
            <div className="card">
              <div className="label">Workforce</div>
              <div className="value">{totalWorkforce}</div>
              <div className="sub">{workforce.length} crews · {totalRegHours}+{totalOtHours} OT hrs</div>
            </div>
            <div className="card">
              <div className="label">Equipment</div>
              <div className="value">{equipment.length}</div>
              <div className="sub">{totalEquipHours.toFixed(1)} hrs · {totalFuel.toFixed(0)} L fuel</div>
            </div>
            <div className="card">
              <div className="label">Tasks Done</div>
              <div className="value">{tasksDone}</div>
              <div className="sub">{tasksPartial} partial · {tasksNotStarted} not started</div>
            </div>
            <div className="card">
              <div className="label">Material Received</div>
              <div className="value">{materials.length}</div>
              <div className="sub">deliveries today</div>
            </div>
          </div>
        )}

        {/* Weather */}
        {has("weather") && (
          <div className="section">
            <h2>Weather</h2>
            <div className="weather-grid">
              <div className="weather-cell"><div className="lbl">Morning</div><div className="val">{WEATHER_LABEL[report.weatherMorning ?? ""] ?? "—"}</div></div>
              <div className="weather-cell"><div className="lbl">Afternoon</div><div className="val">{WEATHER_LABEL[report.weatherAfternoon ?? ""] ?? "—"}</div></div>
              <div className="weather-cell"><div className="lbl">Evening</div><div className="val">{WEATHER_LABEL[report.weatherEvening ?? ""] ?? "—"}</div></div>
            </div>
            <div className="weather-grid">
              <div className="weather-cell"><div className="lbl">Max Temp</div><div className="val">{report.maxTempC ?? "—"} °C</div></div>
              <div className="weather-cell"><div className="lbl">Min Temp</div><div className="val">{report.minTempC ?? "—"} °C</div></div>
              <div className="weather-cell"><div className="lbl">Rainfall</div><div className="val">{report.rainfallMm ?? "—"} mm</div></div>
            </div>
          </div>
        )}

        {/* Workforce */}
        {has("workforce") && (
          <div className="section">
            <h2>Workforce ({workforce.length} entries · {totalWorkforce} persons)</h2>
            {workforce.length === 0 ? <div className="empty">No workforce entries.</div> : (
              <table>
                <thead>
                  <tr>
                    <th>Company / Name</th>
                    <th>Trade</th>
                    <th>Skill</th>
                    <th className="num">Count</th>
                    <th className="num">Reg Hrs</th>
                    <th className="num">OT Hrs</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {workforce.map((w, i) => (
                    <tr key={i}>
                      <td>{w.company || w.staffName || "—"}</td>
                      <td>{w.trade || "—"}</td>
                      <td>{w.skill || "—"}</td>
                      <td className="num">{w.headcount || 0}</td>
                      <td className="num">{w.regHours || 0}</td>
                      <td className="num">{w.otHours || 0}</td>
                      <td>{w.location || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Equipment */}
        {has("equipment") && (
          <div className="section">
            <h2>Equipment ({equipment.length} units)</h2>
            {equipment.length === 0 ? <div className="empty">No equipment entries.</div> : (
              <table>
                <thead>
                  <tr>
                    <th>ID / Reg</th>
                    <th>Type</th>
                    <th>Own/Hire</th>
                    <th className="num">Work</th>
                    <th className="num">Idle</th>
                    <th className="num">Brkdn</th>
                    <th>Operator</th>
                    <th className="num">Fuel (L)</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((e, i) => (
                    <tr key={i}>
                      <td>{e.id || "—"}</td>
                      <td>{e.type || "—"}</td>
                      <td>{e.ownership || "—"}</td>
                      <td className="num">{e.workingHours || 0}</td>
                      <td className="num">{e.idleHours || 0}</td>
                      <td className="num">{e.breakdownHours || 0}</td>
                      <td>{e.operator || "—"}</td>
                      <td className="num">{e.fuel || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Plan vs Actual */}
        {has("progress") && (
          <div className="section">
            <h2>Plan vs Actual ({progress.length} tasks · {tasksDone} done · {tasksPartial} partial · {tasksNotStarted} not started)</h2>
            {progress.length === 0 ? <div className="empty">No progress entries.</div> : (
              <table>
                <thead>
                  <tr>
                    <th>BOQ</th>
                    <th>Task</th>
                    <th>Location</th>
                    <th className="num">Plan</th>
                    <th className="num">Actual</th>
                    <th>Unit</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.map((p, i) => {
                    const plan = Number(p.plannedQty) || 0;
                    const actual = Number(p.actualQty) || 0;
                    const pct = plan > 0 ? Math.min(100, Math.round((actual / plan) * 100)) : actual > 0 ? 100 : 0;
                    return (
                      <tr key={i}>
                        <td>{p.boqCode || "—"}</td>
                        <td>{p.boqDesc || "—"}</td>
                        <td>{p.location || "—"}</td>
                        <td className="num">{plan}</td>
                        <td className="num">{actual}</td>
                        <td>{p.unit || "—"}</td>
                        <td>
                          <span className="progress-bar"><span className="progress-fill" style={{ width: `${pct}%` }} /></span>
                          {pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Material Received */}
        {has("materials") && (
          <div className="section">
            <h2>Material Received</h2>
            {materials.length === 0 ? <div className="empty">No material received.</div> : (
              <table>
                <thead>
                  <tr><th>Material</th><th className="num">Qty</th><th>Unit</th><th>Supplier</th><th>Vehicle</th><th>Test</th></tr>
                </thead>
                <tbody>
                  {materials.map((m, i) => (
                    <tr key={i}>
                      <td>{m.name || "—"}</td>
                      <td className="num">{m.qty || 0}</td>
                      <td>{m.unit || "—"}</td>
                      <td>{m.supplier || "—"}</td>
                      <td>{m.vehicleNo || "—"}</td>
                      <td>{m.testStatus || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Visitors */}
        {has("visitors") && visitors.length > 0 && (
          <div className="section">
            <h2>Site Visitors</h2>
            <table>
              <thead><tr><th>Name</th><th>Organization</th><th>Purpose</th><th>In</th><th>Out</th></tr></thead>
              <tbody>
                {visitors.map((v, i) => (
                  <tr key={i}>
                    <td>{v.visitor || "—"}</td>
                    <td>{v.organization || "—"}</td>
                    <td>{v.purpose || "—"}</td>
                    <td>{v.timeIn || "—"}</td>
                    <td>{v.timeOut || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Meetings */}
        {has("meetings") && meetings.length > 0 && (
          <div className="section">
            <h2>Meetings</h2>
            <table>
              <thead><tr><th>Topic</th><th>Attendees</th><th>Notes</th></tr></thead>
              <tbody>
                {meetings.map((m, i) => (
                  <tr key={i}>
                    <td>{m.topic || "—"}</td>
                    <td>{m.attendees || "—"}</td>
                    <td>{m.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Problems */}
        {has("problems") && (
          <div className="section">
            <h2>Problems / Issues</h2>
            <div className="notes">{report.problems || <span className="empty">None reported.</span>}</div>
          </div>
        )}

        {/* Safety */}
        {has("safety") && (
          <div className="section">
            <h2>Safety Notes</h2>
            <div className="notes">{report.safetyNotes || <span className="empty">None reported.</span>}</div>
          </div>
        )}

        {/* Remarks */}
        {has("remarks") && report.remarks && (
          <div className="section">
            <h2>Remarks</h2>
            <div className="notes">{report.remarks}</div>
          </div>
        )}

        {/* Signature stamps */}
        {has("stamps") && (
          <div className="stamp-row">
            <div className="stamp">
              <div className="role">Prepared by</div>
              <div className="box">
                <div>
                  <div style={{ fontWeight: 600, color: "#111827" }}>{report.createdBy.name}</div>
                  <div style={{ fontSize: "7pt", color: "#6b7280" }}>{report.createdBy.role.replace("_", " ")}</div>
                  <div style={{ fontSize: "7pt", color: "#6b7280", marginTop: "4px" }}>
                    {report.preparedAt ? format(new Date(report.preparedAt), "dd MMM yyyy, HH:mm") : format(new Date(report.createdAt), "dd MMM yyyy")}
                  </div>
                </div>
              </div>
            </div>
            <div className="stamp">
              <div className="role">Submitted to Client</div>
              <div className="box">
                {report.submittedAt ? (
                  <div>
                    <div style={{ fontSize: "8pt", color: "#6b7280" }}>Submitted on</div>
                    <div style={{ fontWeight: 500 }}>{format(new Date(report.submittedAt), "dd MMM yyyy")}</div>
                  </div>
                ) : <div>Awaiting submission</div>}
              </div>
            </div>
            <div className="stamp">
              <div className="role">Client Approved</div>
              <div className="box">
                {report.clientApprovedAt ? (
                  <div>
                    <div style={{ fontSize: "8pt", color: "#6b7280" }}>Approved on</div>
                    <div style={{ fontWeight: 500, color: accentColor }}>{format(new Date(report.clientApprovedAt), "dd MMM yyyy")}</div>
                  </div>
                ) : <div>Awaiting client approval</div>}
              </div>
            </div>
          </div>
        )}

        {/* Footer note */}
        {footerNote && <div className="footer-note">{footerNote}</div>}

        {/* Footer */}
        <div className="footer">
          {project?.name} · {report.number} · Generated {format(new Date(), "dd MMM yyyy HH:mm")} · Page <span className="page-num" />
        </div>
      </div>
    </div>
  );
}
