"use client";

import { useMemo } from "react";
import {
  type ReportLayout, type Cell,
  getPageSize, getContentArea,
  resolveTokens, buildTokenContext, getTableRows, getTableSchema,
} from "@/lib/report-tokens";
import { format } from "date-fns";

const MM_TO_PX = 3.7795; // 1mm ≈ 3.78px at 96 DPI

function safeFormatDate(dateVal: string | number | Date | null | undefined, formatStr: string = "dd MMM yyyy"): string {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  return format(d, formatStr);
}

type Props = {
  layout: ReportLayout;
  entityType: string;
  data: any;
  scale?: number;
  forPrint?: boolean;
};

export function ReportRenderer({ layout, entityType, data, scale = 1, forPrint = false }: Props) {
  const tokenCtx = useMemo(
    () => buildTokenContext(entityType, data),
    [entityType, data]
  );
  const { w: pageWmm, h: pageHmm } = getPageSize(layout.page);

  const pageWpx = pageWmm * MM_TO_PX * scale;
  const pageHpx = pageHmm * MM_TO_PX * scale;

  return (
    <div
      style={{
        width: forPrint ? `${pageWmm}mm` : `${pageWpx}px`,
        minHeight: forPrint ? `${pageHmm}mm` : `${pageHpx}px`,
        background: "white",
        position: "relative",
        margin: "0 auto",
        boxShadow: forPrint ? "none" : "0 1px 3px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)",
        overflow: "hidden",
        fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
        color: "#111827",
      }}
    >
      {layout.page.watermark?.text && (
        <div
          style={{
            position: "absolute",
            top: "50%", left: "50%",
            transform: `translate(-50%, -50%) rotate(-30deg)`,
            fontSize: `${(layout.page.watermark.text.length > 6 ? 90 : 120) * (forPrint ? 1 : scale * 0.5)}pt`,
            fontWeight: 800,
            color: layout.page.watermark.color || "#f3f4f6",
            opacity: layout.page.watermark.opacity ?? 0.6,
            pointerEvents: "none",
            zIndex: 0,
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
          }}
        >
          {layout.page.watermark.text}
        </div>
      )}

      {layout.page.headerNote && (
        <div
          style={{
            position: "absolute",
            top: `${layout.page.margin.top * 0.4 * MM_TO_PX * (forPrint ? 1 : scale)}px`,
            left: `${layout.page.margin.left * MM_TO_PX * (forPrint ? 1 : scale)}px`,
            width: `${(getPageSize(layout.page).w - layout.page.margin.left - layout.page.margin.right) * MM_TO_PX * (forPrint ? 1 : scale)}px`,
            background: "#fef3c7",
            borderLeft: `3px solid #f59e0b`,
            padding: `${4 * scale}px ${8 * scale}px`,
            fontSize: `${9 * (forPrint ? 1 : scale)}pt`,
            borderRadius: "2px",
            zIndex: 1,
          }}
        >
          {layout.page.headerNote}
        </div>
      )}

      {layout.cells.map(cell => (
        <CellRenderer
          key={cell.id}
          cell={cell}
          tokenCtx={tokenCtx}
          data={data}
          scale={scale}
          forPrint={forPrint}
        />
      ))}

      {entityType === "schedule" && (
        <div
          style={{
            position: "absolute",
            top: `${(Math.max(10, ...layout.cells.map(c => c.y + c.h)) + 5) * MM_TO_PX * (forPrint ? 1 : scale)}px`,
            left: `${layout.page.margin.left * MM_TO_PX * (forPrint ? 1 : scale)}px`,
            width: `${(pageWmm - layout.page.margin.left - layout.page.margin.right) * MM_TO_PX * (forPrint ? 1 : scale)}px`,
            border: "1px dashed #cbd5e1",
            borderRadius: "4px",
            background: "#f8fafc",
            padding: `${12 * scale}px`,
            display: "flex",
            flexDirection: "column",
            gap: `${8 * scale}px`,
            fontSize: `${10 * scale}px`,
            color: "#64748b",
            pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px", fontWeight: "bold" }}>
            <div style={{ width: "30%" }}>WBS / Task Name</div>
            <div style={{ width: "15%" }}>Start</div>
            <div style={{ width: "15%" }}>End</div>
            <div style={{ flex: 1, textAlign: "center" }}>Timeline (Jan - Dec)</div>
          </div>
          {[
            { wbs: "1", name: "Project Start", days: "01 Jan - 15 Feb", barLeft: "10%", barWidth: "25%", color: "#3b82f6" },
            { wbs: "1.1", name: "Site Mobilization", days: "02 Jan - 20 Jan", barLeft: "10%", barWidth: "12%", color: "#10b981" },
            { wbs: "1.2", name: "Excavation Works", days: "21 Jan - 15 Feb", barLeft: "22%", barWidth: "13%", color: "#f59e0b" },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ width: "30%", fontWeight: row.wbs.includes(".") ? "normal" : "bold" }}>
                {row.wbs} {row.name}
              </div>
              <div style={{ width: "30%", fontSize: `${9 * scale}px` }}>{row.days}</div>
              <div style={{ flex: 1, position: "relative", height: `${12 * scale}px`, background: "#f1f5f9", borderRadius: "2px" }}>
                <div
                  style={{
                    position: "absolute",
                    left: row.barLeft,
                    width: row.barWidth,
                    height: "100%",
                    background: row.color,
                    borderRadius: "2px",
                  }}
                />
              </div>
            </div>
          ))}
          <div style={{ textAlign: "center", fontStyle: "italic", fontSize: `${9 * scale}px`, marginTop: `${4 * scale}px` }}>
            [Gantt chart body renders here automatically on print]
          </div>
        </div>
      )}

      {layout.page.footerNote && (
        <div
          style={{
            position: "absolute",
            bottom: `${layout.page.margin.bottom * 0.4 * MM_TO_PX * (forPrint ? 1 : scale)}px`,
            left: `${layout.page.margin.left * MM_TO_PX * (forPrint ? 1 : scale)}px`,
            width: `${(getPageSize(layout.page).w - layout.page.margin.left - layout.page.margin.right) * MM_TO_PX * (forPrint ? 1 : scale)}px`,
            background: "#f0fdf4",
            border: `1px solid #bbf7d0`,
            padding: `${4 * scale}px ${8 * scale}px`,
            fontSize: `${9 * (forPrint ? 1 : scale)}pt`,
            borderRadius: "2px",
            textAlign: "center",
            zIndex: 1,
          }}
        >
          {layout.page.footerNote}
        </div>
      )}
    </div>
  );
}

function CellRenderer({ cell, tokenCtx, data, scale, forPrint }: {
  cell: Cell;
  tokenCtx: Record<string, string>;
  data: any;
  scale: number;
  forPrint: boolean;
}) {
  const mm = (n: number) => forPrint ? `${n}mm` : `${n * MM_TO_PX * scale}px`;

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: mm(cell.x),
    top: mm(cell.y),
    width: mm(cell.w),
    height: mm(cell.h),
    overflow: "hidden",
    boxSizing: "border-box",
    zIndex: cell.zIndex ?? 0,
  };

  const s = cell.style;
  const cellStyle: React.CSSProperties = {
    ...baseStyle,
    fontSize: s.fontSize ? `${s.fontSize * (forPrint ? 1 : scale)}pt` : undefined,
    fontFamily: s.fontFamily === "serif" ? '"Times New Roman", Georgia, serif'
      : s.fontFamily === "sans-serif" ? "Arial, Helvetica, sans-serif"
      : undefined,
    fontWeight: s.bold ? "700" : undefined,
    fontStyle: s.italic ? "italic" : undefined,
    textDecoration: s.underline ? "underline" : undefined,
    color: s.color,
    background: s.bg,
    textAlign: s.align,
    padding: s.padding ? `${s.padding * (forPrint ? 1 : scale)}pt` : undefined,
    borderRadius: s.borderRadius ? `${s.borderRadius * (forPrint ? 1 : scale)}px` : undefined,
    display: s.valign === "middle" || s.valign === "bottom" ? "flex" : "block",
    alignItems: s.valign === "middle" ? "center" : s.valign === "bottom" ? "flex-end" : undefined,
    justifyContent: s.align === "center" ? "center" : s.align === "right" ? "flex-end" : undefined,
  };

  if (s.border && s.border !== "none") {
    const bw = (s.borderWidth ?? 1) * (forPrint ? 1 : scale);
    const bc = s.borderColor || "#d1d5db";
    if (s.border === "all") cellStyle.border = `${bw}px solid ${bc}`;
    else if (s.border === "bottom") { cellStyle.borderTop = "none"; cellStyle.borderLeft = "none"; cellStyle.borderRight = "none"; cellStyle.borderBottom = `${bw}px solid ${bc}`; }
    else if (s.border === "top") { cellStyle.borderTop = `${bw}px solid ${bc}`; cellStyle.borderBottom = "none"; cellStyle.borderLeft = "none"; cellStyle.borderRight = "none"; }
    else if (s.border === "left") { cellStyle.borderLeft = `${bw}px solid ${bc}`; cellStyle.borderTop = "none"; cellStyle.borderBottom = "none"; cellStyle.borderRight = "none"; }
    else if (s.border === "right") { cellStyle.borderRight = `${bw}px solid ${bc}`; cellStyle.borderTop = "none"; cellStyle.borderBottom = "none"; cellStyle.borderLeft = "none"; }
  }

  let content: React.ReactNode = null;
  switch (cell.content.type) {
    case "text": {
      const resolved = resolveTokens((cell.content as any).text, tokenCtx);
      content = resolved.split("\n").map((line, i, arr) => (
        <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
      ));
      break;
    }
    case "table": {
      const tc = cell.content as any;
      const rows = getTableRows(tc.entity, data);
      const schema = getTableSchema(tc.entity);
      const cols = schema?.columns.filter(c => tc.columns.includes(c.id)) ?? [];
      content = (
        <TableRenderer
          rows={rows}
          cols={cols}
          showHeader={tc.showHeader !== false}
          zebra={tc.zebra}
          columnWidths={tc.columnWidths}
          scale={scale}
          forPrint={forPrint}
        />
      );
      break;
    }
    case "kpi": {
      const kc = cell.content as any;
      const val = tokenCtx[kc.metric] ?? "—";
      content = (
        <div style={{ textAlign: "center", width: "100%" }}>
          <div style={{
            fontSize: `${14 * (forPrint ? 1 : scale)}pt`,
            fontWeight: 600,
            color: s.color || "#059669",
            lineHeight: 1.2,
          }}>
            {val}
          </div>
          <div style={{
            fontSize: `${7 * (forPrint ? 1 : scale)}pt`,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginTop: 2,
          }}>
            {kc.label}
          </div>
        </div>
      );
      break;
    }
    case "image": {
      const ic = cell.content as any;
      content = (
        <img
          src={ic.src}
          alt={ic.alt || ""}
          style={{
            maxWidth: "100%", maxHeight: "100%",
            objectFit: ic.fit || "contain",
            display: "block",
            margin: "0 auto",
          }}
        />
      );
      break;
    }
    case "divider": {
      const dc = cell.content as any;
      const thickness = (dc.thickness ?? 1) * (forPrint ? 1 : scale);
      if (dc.orientation === "vertical") {
        content = <div style={{ width: `${thickness}px`, height: "100%", background: s.color || "#d1d5db", margin: "0 auto" }} />;
      } else {
        content = <div style={{ height: `${thickness}px`, width: "100%", background: s.color || "#d1d5db" }} />;
      }
      break;
    }
    case "signature": {
      const sc = cell.content as any;
      const report = data?.report;
      let label: string;
      let value: React.ReactNode;

      const preparedDateStr = report?.preparedAt 
        ? safeFormatDate(report.preparedAt) 
        : (report?.createdAt ? safeFormatDate(report.createdAt) : "—");
      const submittedDateStr = safeFormatDate(report?.submittedAt);
      const approvedDateStr = safeFormatDate(report?.clientApprovedAt);

      switch (sc.role) {
        case "prepared":
          label = "Prepared by";
          value = (
            <>
              <div style={{ fontWeight: 600, color: "#111827" }}>{report?.createdBy?.name ?? "—"}</div>
              <div style={{ fontSize: `${7 * (forPrint ? 1 : scale)}pt`, color: "#6b7280" }}>{report?.createdBy?.role?.replace("_", " ") ?? "—"}</div>
              <div style={{ fontSize: `${7 * (forPrint ? 1 : scale)}pt`, color: "#6b7280", marginTop: 2 }}>
                {preparedDateStr}
              </div>
            </>
          );
          break;
        case "submitted":
          label = "Submitted to Client";
          value = report?.submittedAt ? (
            <>
              <div style={{ fontSize: `${7 * (forPrint ? 1 : scale)}pt`, color: "#6b7280" }}>Submitted on</div>
              <div style={{ fontWeight: 500 }}>{submittedDateStr}</div>
            </>
          ) : <div style={{ fontSize: `${7 * (forPrint ? 1 : scale)}pt`, color: "#9ca3af", fontStyle: "italic" }}>Awaiting submission</div>;
          break;
        case "approved":
          label = "Client Approved";
          value = report?.clientApprovedAt ? (
            <>
              <div style={{ fontSize: `${7 * (forPrint ? 1 : scale)}pt`, color: "#6b7280" }}>Approved on</div>
              <div style={{ fontWeight: 500, color: "#059669" }}>{approvedDateStr}</div>
            </>
          ) : <div style={{ fontSize: `${7 * (forPrint ? 1 : scale)}pt`, color: "#9ca3af", fontStyle: "italic" }}>Awaiting approval</div>;
          break;
        default:
          label = sc.customLabel || "Signature";
          value = <div style={{ fontSize: `${7 * (forPrint ? 1 : scale)}pt`, color: "#9ca3af", fontStyle: "italic" }}>Pending</div>;
      }
      content = (
        <div style={{ textAlign: "center", width: "100%" }}>
          <div style={{ fontSize: `${7 * (forPrint ? 1 : scale)}pt`, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
            {label}
          </div>
          {value}
        </div>
      );
      break;
    }
  }

  return <div style={cellStyle}>{content}</div>;
}

function TableRenderer({ rows, cols, showHeader, zebra, columnWidths, scale, forPrint }: {
  rows: any[];
  cols: { id: string; label: string; width?: number }[];
  showHeader: boolean;
  zebra?: boolean;
  columnWidths?: Record<string, number>;
  scale: number;
  forPrint: boolean;
}) {
  if (!cols.length || !rows.length) {
    return (
      <div style={{
        fontSize: `${8 * (forPrint ? 1 : scale)}pt`,
        color: "#9ca3af",
        fontStyle: "italic",
        textAlign: "center",
        padding: "8px 0",
      }}>
        No data
      </div>
    );
  }
  // Use explicit columnWidths if provided, else fall back to schema defaults
  const widths = cols.map(c => columnWidths?.[c.id] ?? c.width ?? 1);
  const totalWidth = widths.reduce((s, w) => s + w, 0);
  const colWidths = widths.map(w => `${(w / totalWidth) * 100}%`);

  return (
    <table style={{
      width: "100%",
      borderCollapse: "collapse",
      fontSize: `${8 * (forPrint ? 1 : scale)}pt`,
      tableLayout: "fixed",
      height: "100%",
    }}>
      {showHeader && (
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={c.id} style={{
                border: `${1 * (forPrint ? 1 : scale)}px solid #d1d5db`,
                padding: `${2 * (forPrint ? 1 : scale)}px ${4 * (forPrint ? 1 : scale)}px`,
                background: "#f9fafb",
                fontWeight: 600,
                color: "#374151",
                textAlign: "left",
                width: colWidths[i],
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={zebra && ri % 2 === 1 ? { background: "#fafbfc" } : undefined}>
            {cols.map((c, ci) => (
              <td key={c.id} style={{
                border: `${1 * (forPrint ? 1 : scale)}px solid #d1d5db`,
                padding: `${2 * (forPrint ? 1 : scale)}px ${4 * (forPrint ? 1 : scale)}px`,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: typeof row[c.id] === "number" ? "nowrap" : "normal",
                textAlign: typeof row[c.id] === "number" ? "right" : "left",
                verticalAlign: "top",
                width: colWidths[ci],
              }}>
                {row[c.id] ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
