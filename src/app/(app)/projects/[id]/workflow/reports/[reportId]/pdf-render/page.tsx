"use client";

import { use, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { ReportRenderer } from "@/components/report-designer/report-renderer";
import { type ReportLayout } from "@/lib/report-tokens";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

export default function PdfRenderPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = use(params);
  const [layout, setLayout] = useState<ReportLayout | null>(null);

  const { data: reportData, isLoading } = trpc.workflow.dailyReport.getReport.useQuery({ reportId });

  // Read layout from localStorage (written by the designer).
  // localStorage is shared across same-origin tabs, so window.open() can read it.
  useEffect(() => {
    try {
      const key = `pdf-designer-layout-daily_report-${reportId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.cells && parsed?.page) {
          setLayout(parsed);
          return;
        }
      }
    } catch { /* ignore */ }
    // Fallback: empty layout
    setLayout({ page: { paper: "A4", orientation: "portrait", margin: { top: 15, right: 15, bottom: 15, left: 15 } }, cells: [] });
  }, [reportId]);

  // Auto-trigger print once layout & data are ready
  useEffect(() => {
    if (!isLoading && layout && reportData) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [isLoading, layout, reportData]);

  if (isLoading || !layout || !reportData) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="pdf-render-root">
      <style>{`
        @page { margin: 0; size: ${layout.page.paper} ${layout.page.orientation}; }
        html, body { margin: 0; padding: 0; background: white; }
        .pdf-render-root { padding: 16px; }
        .toolbar {
          position: fixed; top: 8px; right: 8px;
          display: flex; gap: 6px; z-index: 100;
        }
        .toolbar button {
          padding: 4px 10px; font-size: 9pt;
          border: 1px solid #d1d5db; background: white; border-radius: 3px;
          cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .toolbar button:hover { background: #f9fafb; }
        @media print {
          .toolbar { display: none !important; }
          .pdf-render-root { padding: 0 !important; }
        }
      `}</style>

      <div className="toolbar">
        <button onClick={() => window.print()}>
          <Printer className="inline h-3 w-3 mr-1" /> Print / Save PDF
        </button>
        <button onClick={() => window.close()}>
          <X className="inline h-3 w-3 mr-1" /> Close
        </button>
      </div>

      <div className="flex justify-center">
        <ReportRenderer
          layout={layout}
          entityType="daily_report"
          data={reportData}
          scale={1}
          forPrint={true}
        />
      </div>
    </div>
  );
}
