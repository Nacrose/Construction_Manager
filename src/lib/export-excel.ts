/**
 * Excel export utilities for tax and financial reports.
 *
 * Uses xlsx (SheetJS) — dynamically imported to keep it out of the
 * initial bundle (~516 KB). Only loads when the user clicks Export.
 */

type IpcTaxRow = {
  number: string;
  period: string | null;
  status: string;
  subcontractorName: string | null;
  issueDate: string | Date | null;
  grossAmount: number;
  vatPercent: number;
  vatAmount: number;
  tdsPercent: number;
  tdsAmount: number;
  retentionAmount: number;
  advanceRecovery: number;
  finalPayable: number;
};

type MaterialTaxRow = {
  date: string | Date;
  materialName: string;
  quantity: number;
  unit: string;
  rate: number;
  baseAmount: number;
  vatPercent: number;
  vatAmount: number;
  tdsPercent: number;
  tdsAmount: number;
  netPayable: number;
  supplierInvoiceNo: string | null;
  supplierPan: string | null;
};

/**
 * Export IPC tax data to Excel — one sheet with per-IPC breakdown,
 * one sheet with monthly trend, one sheet with totals.
 */
export async function exportIpcTaxToXlsx(
  ipcs: IpcTaxRow[],
  byMonth: Array<{ month: string; grossAmount: number; vatAmount: number; tdsAmount: number; retentionAmount: number; finalPayable: number }>,
  totals: { count: number; totalGross: number; totalVat: number; totalTds: number; totalRetention: number; totalFinalPayable: number },
  projectName: string
) {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  // Sheet 1: Per-IPC breakdown
  const ipcRows = ipcs.map((i) => ({
    "IPC #": i.number,
    "Period": i.period ?? "",
    "Status": i.status,
    "Subcontractor": i.subcontractorName ?? "",
    "Issue Date": i.issueDate ? new Date(i.issueDate).toLocaleDateString() : "",
    "Gross (NPR)": i.grossAmount,
    "VAT %": i.vatPercent,
    "VAT Amount (NPR)": i.vatAmount,
    "TDS %": i.tdsPercent,
    "TDS Amount (NPR)": i.tdsAmount,
    "Retention (NPR)": i.retentionAmount,
    "Advance Recovery (NPR)": i.advanceRecovery,
    "Final Payable (NPR)": i.finalPayable,
  }));
  const ws1 = XLSX.utils.json_to_sheet(ipcRows);
  ws1["!cols"] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 12 },
    { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "IPC Breakdown");

  // Sheet 2: Monthly trend
  const monthRows = byMonth.map((m) => ({
    "Month": m.month,
    "Gross (NPR)": m.grossAmount,
    "VAT (NPR)": m.vatAmount,
    "TDS (NPR)": m.tdsAmount,
    "Retention (NPR)": m.retentionAmount,
    "Final Payable (NPR)": m.finalPayable,
  }));
  const ws2 = XLSX.utils.json_to_sheet(monthRows);
  ws2["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Monthly Trend");

  // Sheet 3: Totals
  const totalsRows = [
    { "Metric": "Total IPCs", "Value": totals.count },
    { "Metric": "Total Gross (NPR)", "Value": totals.totalGross },
    { "Metric": "Total VAT Collected (NPR)", "Value": totals.totalVat },
    { "Metric": "Total TDS Deducted (NPR)", "Value": totals.totalTds },
    { "Metric": "Total Retention (NPR)", "Value": totals.totalRetention },
    { "Metric": "Total Final Payable (NPR)", "Value": totals.totalFinalPayable },
  ];
  const ws3 = XLSX.utils.json_to_sheet(totalsRows);
  ws3["!cols"] = [{ wch: 30 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Totals");

  const filename = `${projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_IPC_Tax.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Export material tax data to Excel — per-transaction sheet + by-supplier
 * sheet + monthly trend sheet + totals sheet.
 */
export async function exportMaterialTaxToXlsx(
  transactions: MaterialTaxRow[],
  bySupplier: Array<{ supplierPan: string | null; supplierInvoiceNo: string | null; count: number; baseAmount: number; vatAmount: number; tdsAmount: number; netPayable: number }>,
  byMonth: Array<{ month: string; baseAmount: number; vatAmount: number; tdsAmount: number; netPayable: number }>,
  totals: { count: number; totalBaseAmount: number; totalVatAmount: number; totalTdsAmount: number; totalNetPayable: number },
  projectName: string
) {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  // Sheet 1: Per-transaction
  const txnRows = transactions.map((t) => ({
    "Date": new Date(t.date).toLocaleDateString(),
    "Material": t.materialName,
    "Qty": t.quantity,
    "Unit": t.unit,
    "Rate (NPR)": t.rate,
    "Base Amount (NPR)": t.baseAmount,
    "VAT %": t.vatPercent,
    "VAT Amount (NPR)": t.vatAmount,
    "TDS %": t.tdsPercent,
    "TDS Amount (NPR)": t.tdsAmount,
    "Net Payable (NPR)": t.netPayable,
    "Supplier Invoice": t.supplierInvoiceNo ?? "",
    "Supplier PAN": t.supplierPan ?? "",
  }));
  const ws1 = XLSX.utils.json_to_sheet(txnRows);
  ws1["!cols"] = [
    { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 6 }, { wch: 10 },
    { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Transactions");

  // Sheet 2: By supplier
  const supplierRows = bySupplier.map((s) => ({
    "Supplier PAN": s.supplierPan ?? "",
    "Invoice #": s.supplierInvoiceNo ?? "",
    "Transactions": s.count,
    "Base Amount (NPR)": s.baseAmount,
    "VAT (NPR)": s.vatAmount,
    "TDS (NPR)": s.tdsAmount,
    "Net Payable (NPR)": s.netPayable,
  }));
  const ws2 = XLSX.utils.json_to_sheet(supplierRows);
  ws2["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, "By Supplier");

  // Sheet 3: Monthly trend
  const monthRows = byMonth.map((m) => ({
    "Month": m.month,
    "Base (NPR)": m.baseAmount,
    "VAT (NPR)": m.vatAmount,
    "TDS (NPR)": m.tdsAmount,
    "Net Payable (NPR)": m.netPayable,
  }));
  const ws3 = XLSX.utils.json_to_sheet(monthRows);
  ws3["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Monthly Trend");

  // Sheet 4: Totals
  const totalsRows = [
    { "Metric": "Total Transactions", "Value": totals.count },
    { "Metric": "Total Base Amount (NPR)", "Value": totals.totalBaseAmount },
    { "Metric": "Total VAT Collected (NPR)", "Value": totals.totalVatAmount },
    { "Metric": "Total TDS Deducted (NPR)", "Value": totals.totalTdsAmount },
    { "Metric": "Total Net Payable (NPR)", "Value": totals.totalNetPayable },
  ];
  const ws4 = XLSX.utils.json_to_sheet(totalsRows);
  ws4["!cols"] = [{ wch: 30 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Totals");

  const filename = `${projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Material_Tax.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Export daily reports to Excel — one row per report with key fields.
 */
export async function exportDailyReportsToXlsx(
  reports: Array<{
    number: string;
    reportDate: string | Date;
    status: string;
    weather: string | null;
    workforce: string | null;
    workProgress: string | null;
    problems: string | null;
    safetyNotes: string | null;
    remarks: string | null;
  }>,
  projectName: string
) {
  const XLSX = await import("xlsx");

  const rows = reports.map((r) => ({
    "Report #": r.number,
    "Date": new Date(r.reportDate).toLocaleDateString(),
    "Status": r.status,
    "Weather": r.weather ?? "",
    "Workforce": r.workforce ?? "",
    "Work Progress": r.workProgress ?? "",
    "Problems": r.problems ?? "",
    "Safety Notes": r.safetyNotes ?? "",
    "Remarks": r.remarks ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 },
    { wch: 20 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Daily Reports");

  const filename = `${projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Daily_Reports.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Export project costs to Excel — one row per cost entry.
 */
export async function exportProjectCostsToXlsx(
  costs: Array<{
    date: string | Date;
    category: string;
    subcategory: string | null;
    description: string;
    amount: number;
    boqItemCode: string | null;
    ganttTaskName: string | null;
    createdBy: string | null;
  }>,
  projectName: string
) {
  const XLSX = await import("xlsx");

  const rows = costs.map((c) => ({
    "Date": new Date(c.date).toLocaleDateString(),
    "Category": c.category,
    "Subcategory": c.subcategory ?? "",
    "Description": c.description,
    "Amount (NPR)": c.amount,
    "BOQ Item": c.boqItemCode ?? "",
    "Gantt Task": c.ganttTaskName ?? "",
    "Created By": c.createdBy ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 40 },
    { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 15 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Project Costs");

  // Add summary sheet by category
  const categoryMap = new Map<string, number>();
  for (const c of costs) {
    categoryMap.set(c.category, (categoryMap.get(c.category) ?? 0) + c.amount);
  }
  const summaryRows = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({ Category: category, "Total (NPR)": amount }))
    .sort((a, b) => b["Total (NPR)"] - a["Total (NPR)"]);
  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  ws2["!cols"] = [{ wch: 15 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Summary by Category");

  const filename = `${projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Costs.xlsx`;
  XLSX.writeFile(wb, filename);
}
