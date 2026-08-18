"use client";

import { toast } from "sonner";
import type { BoqItem } from "./types";

/**
 * Export BOQ items to a 2-sheet Excel workbook:
 *   Sheet 1 "BOQ":           one row per BOQ item, with grand total row
 *   Sheet 2 "Rate Analysis": ingredient breakdown per item (only if any exist)
 *
 * File is named BOQ_<last 8 chars of projectId>.xlsx.
 *
 * NOTE: xlsx (SheetJS) is dynamically imported to keep it out of the
 * initial bundle (~516 KB). It only loads when the user actually
 * clicks Export.
 */
export async function exportBoq(items: BoqItem[], projectId: string) {
  const XLSX = await import("xlsx");

  const boqRows = items.map((it) => ({
    Section: it.section ?? "",
    Code: it.code,
    Description: it.description,
    Category: it.category ?? "",
    Unit: it.unit,
    Quantity: it.quantity,
    "Rate (NPR)": it.rate,
    "Amount (NPR)": it.amount,
  }));
  const totalAmount = items.reduce((s, i) => s + i.amount, 0);
  boqRows.push({
    Section: "",
    Code: "",
    Description: "GRAND TOTAL",
    Category: "",
    Unit: "",
    Quantity: 0,
    "Rate (NPR)": 0,
    "Amount (NPR)": totalAmount,
  });

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(boqRows);
  ws1["!cols"] = [{ wch: 25 }, { wch: 10 }, { wch: 45 }, { wch: 15 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws1, "BOQ");

  const ingRows: Record<string, unknown>[] = [];
  items.forEach((it) => {
    if (it.ingredients.length === 0) return;
    ingRows.push({
      "BOQ Code": it.code,
      "BOQ Description": it.description,
      Ingredient: "—",
      Type: "",
      Quantity: 0,
      Unit: "",
      Rate: 0,
      Amount: 0,
    });
    it.ingredients.forEach((ing) => {
      ingRows.push({
        "BOQ Code": it.code,
        "BOQ Description": "",
        Ingredient: ing.name,
        Type: ing.type,
        Quantity: ing.quantity,
        Unit: ing.unit,
        Rate: ing.rate,
        Amount: ing.amount,
      });
    });
  });
  if (ingRows.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(ingRows);
    ws2["!cols"] = [{ wch: 10 }, { wch: 35 }, { wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Rate Analysis");
  }

  XLSX.writeFile(wb, `BOQ_${projectId.slice(-8)}.xlsx`);
  toast.success(`Exported ${items.length} BOQ items to Excel`);
}

/**
 * Import BOQ items from an Excel file (expects a "BOQ" sheet, falls back
 * to the first sheet if not present). Skips rows with empty code/description
 * and the "GRAND TOTAL" row. Calls utils.boq.create.mutate for each
 * valid row.
 *
 * @param file   Excel file from <input type="file">
 * @param projectId Target project ID
 * @param utils  tRPC React Query utils (for mutate + invalidate)
 * @param onDone Callback after import completes (success or partial failure)
 */
export async function importBoq(
  file: File,
  projectId: string,
  utils: any,
  onDone: () => void
) {
  try {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets["BOQ"] ?? wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

    let imported = 0;
    let skipped = 0;
    let sortOrder = 0;

    for (const row of rows) {
      const code = String(row.Code ?? row.code ?? "").trim();
      const description = String(row.Description ?? row.description ?? "").trim();
      if (!code || !description || code === "" || description === "GRAND TOTAL") {
        skipped++;
        continue;
      }
      const unit = String(row.Unit ?? row.unit ?? "no").trim() || "no";
      const quantity = parseFloat(String(row.Quantity ?? row.quantity ?? 0)) || 0;
      const rate = parseFloat(String(row["Rate (NPR)"] ?? row.rate ?? 0)) || 0;
      const category = String(row.Category ?? row.category ?? "").trim() || undefined;
      const section = String(row.Section ?? row.section ?? "").trim() || undefined;

      try {
        await utils.boq.create.mutateAsync({
          projectId,
          code,
          description,
          unit,
          quantity,
          rate,
          category,
          section,
          sortOrder,
        });
        imported++;
      } catch {
        skipped++;
      }
      sortOrder++;
    }

    toast.success(`Imported ${imported} BOQ items${skipped > 0 ? ` (${skipped} skipped)` : ""}`);
    onDone();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Import failed");
  }
}
