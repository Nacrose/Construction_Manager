"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Table as TableIcon,
} from "lucide-react";
import { toast } from "sonner";

interface ParsedPaymentRow {
  payeeName: string;
  partyPan?: string;
  payeeType: string;
  category?: string;
  subCategory?: string;
  amount: number;
  tdsDeducted: number;
  paymentDate?: string;
  paymentMiti?: string;
  paymentMode: "cash" | "bank_transfer" | "cheque" | "mobile_pay" | "connectips";
  accountingSoftware?: "tally" | "swastik" | "other";
  accountingVoucherNo?: string;
  voucherType?: "payment" | "bank_payment" | "cash_payment" | "journal";
  bankAccount?: string;
  chequeNo?: string;
  notes?: string;
  isValid: boolean;
  error?: string;
}

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BulkImportDialog({
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formatType, setFormatType] = useState<"tally" | "swastik" | "standard">("tally");
  const [parsedRows, setParsedRows] = useState<ParsedPaymentRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const bulkMut = trpc.projectOps.payment.bulkCreate.useMutation({
    onSuccess: (data) => {
      toast.success(`Successfully imported ${data.count} payments into project ledger!`);
      onSuccess();
      onOpenChange(false);
      resetState();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetState = () => {
    setParsedRows([]);
    setFileName("");
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadSampleTemplate = (type: "tally" | "swastik" | "standard") => {
    try {
      let headers: string[] = [];
      let sampleData: any[][] = [];

      if (type === "tally") {
        headers = [
          "Date (AD / YYYY-MM-DD)",
          "Miti (BS)",
          "Tally Voucher No",
          "Voucher Type",
          "Cost Category (Head)",
          "Cost Center (Subcategory)",
          "Ledger / Payee Name",
          "Party PAN",
          "Debit Amount (NPR)",
          "TDS Deducted (NPR)",
          "Bank / Cash Account",
          "Cheque / Ref No",
          "Narration / Notes",
        ];
        sampleData = [
          [
            "2026-08-20",
            "2081/05/04",
            "PV-2081-0104",
            "bank_payment",
            "Plant & Machinery",
            "Heavy Equipment Diesel / Fuel",
            "Shree Ganesh Petroleum",
            "300123456",
            145000,
            2175,
            "Nabil Bank Site A/C",
            "CHQ-98104",
            "Diesel for Excavator EX-01 & Grader",
          ],
          [
            "2026-08-21",
            "2081/05/05",
            "PV-2081-0105",
            "cash_payment",
            "Site Overheads",
            "Food & Mess / Khaja",
            "Site Camp Mess",
            "",
            18500,
            0,
            "Site Petty Cash",
            "",
            "Weekly camp food & worker mess expenses",
          ],
          [
            "2026-08-22",
            "2081/05/06",
            "PV-2081-0106",
            "bank_payment",
            "Direct Site Labor",
            "Daily Wage Muster Roll",
            "Labor Gang Leader Ram Bahadur",
            "601987654",
            95000,
            1425,
            "Global IME Head Office",
            "connectIPS-7721",
            "Masonry gang weekly labor payment",
          ],
        ];
      } else if (type === "swastik") {
        headers = [
          "Miti (BS / YYYY/MM/DD)",
          "Date (AD)",
          "Voucher No",
          "Voucher Type",
          "Account Head",
          "Sub-Ledger",
          "Party Name",
          "PAN No",
          "Amount",
          "TDS",
          "Bank / Cash A/c",
          "Cheque No",
          "Narration",
        ];
        sampleData = [
          [
            "2081/05/04",
            "2026-08-20",
            "BP-042",
            "bank_payment",
            "Site Overheads",
            "Transport, Fuel & Vehicle Travel",
            "Bagmati Auto Repairs",
            "301298765",
            35000,
            525,
            "Nabil Bank",
            "440129",
            "Pickup vehicle monthly servicing",
          ],
          [
            "2081/05/05",
            "2026-08-21",
            "CP-015",
            "cash_payment",
            "Site Overheads",
            "Electricity, Water & Utilities",
            "NEA Lalitpur Counter",
            "",
            12450,
            0,
            "Petty Cash",
            "",
            "Site camp electricity bill for Shrawan",
          ],
        ];
      } else {
        headers = [
          "Date",
          "Miti",
          "Category",
          "SubCategory",
          "Payee Name",
          "PAN",
          "Amount",
          "TDS",
          "Payment Mode",
          "Voucher No",
          "Bank Account",
          "Notes",
        ];
        sampleData = [
          [
            "2026-08-22",
            "2081/05/06",
            "Materials",
            "Cement",
            "Shivam Cement Suppliers",
            "300224455",
            250000,
            3750,
            "bank_transfer",
            "VR-991",
            "Nabil Bank",
            "Supply of 350 bags OPC Cement",
          ],
        ];
      }

      const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Import Template");
      XLSX.writeFile(wb, `${type}_payment_import_template.xlsx`);
      toast.success(`Sample ${type.toUpperCase()} template downloaded`);
    } catch {
      toast.error("Failed to generate sample template");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (json.length < 2) {
          toast.error("Spreadsheet is empty or missing data rows.");
          setIsProcessing(false);
          return;
        }

        const headers = json[0].map((h: any) => String(h || "").trim().toLowerCase());
        const dataRows = json.slice(1);

        const parsed: ParsedPaymentRow[] = [];

        for (let idx = 0; idx < dataRows.length; idx++) {
          const row = dataRows[idx];
          if (!row || row.length === 0 || row.every((c) => c === undefined || c === null || c === "")) {
            continue;
          }

          // Map column indices intelligently based on header keywords
          const getCol = (...keywords: string[]) => {
            const index = headers.findIndex((h) => keywords.some((k) => h.includes(k)));
            return index >= 0 ? row[index] : undefined;
          };

          const rawDate = getCol("date (ad", "date", "मिति (ad)");
          const rawMiti = getCol("miti", "मिति");
          const voucherNo = getCol("voucher no", "voucher", "नम्बर");
          const rawVoucherType = String(getCol("voucher type", "type") || "payment").toLowerCase();
          const category = String(getCol("cost category", "category", "account head", "head") || "Site Overheads").trim();
          const subCategory = String(getCol("cost center", "subcategory", "sub-ledger", "sub") || "").trim();
          const payeeName = String(getCol("ledger", "payee", "party", "नाम") || "").trim();
          const partyPan = String(getCol("pan", "पान") || "").trim();
          const rawAmount = parseFloat(String(getCol("debit", "amount", "रकम") || "0").replace(/,/g, ""));
          const rawTds = parseFloat(String(getCol("tds", "टिडिएस") || "0").replace(/,/g, ""));
          const bankAccount = String(getCol("bank", "account", "खाता") || "").trim();
          const chequeNo = String(getCol("cheque", "ref", "चेक") || "").trim();
          const notes = String(getCol("narration", "notes", "विवरण") || "").trim();

          const amount = isNaN(rawAmount) ? 0 : rawAmount;
          const tdsDeducted = isNaN(rawTds) ? 0 : rawTds;

          let paymentMode: "cash" | "bank_transfer" | "cheque" | "mobile_pay" | "connectips" = "bank_transfer";
          if (rawVoucherType.includes("cash") || bankAccount.toLowerCase().includes("cash") || bankAccount.toLowerCase().includes("petty")) {
            paymentMode = "cash";
          } else if (chequeNo || rawVoucherType.includes("cheque")) {
            paymentMode = "cheque";
          } else if (bankAccount.toLowerCase().includes("connectips") || notes.toLowerCase().includes("connectips")) {
            paymentMode = "connectips";
          }

          let voucherType: "payment" | "bank_payment" | "cash_payment" | "journal" = "payment";
          if (rawVoucherType.includes("bank")) voucherType = "bank_payment";
          else if (rawVoucherType.includes("cash")) voucherType = "cash_payment";
          else if (rawVoucherType.includes("journal") || rawVoucherType.includes("jv")) voucherType = "journal";

          const isValid = Boolean(payeeName && amount > 0);
          const error = !payeeName ? "Missing Payee/Ledger Name" : amount <= 0 ? "Amount must be > 0" : undefined;

          parsed.push({
            payeeName: payeeName || `Unspecified Ledger (Row ${idx + 2})`,
            partyPan: partyPan || undefined,
            payeeType: "vendor",
            category: category || "Site Overheads",
            subCategory: subCategory || undefined,
            amount,
            tdsDeducted,
            paymentDate: rawDate ? new Date(rawDate).toISOString() : new Date().toISOString(),
            paymentMiti: rawMiti ? String(rawMiti) : undefined,
            paymentMode,
            accountingSoftware: formatType === "standard" ? "other" : formatType,
            accountingVoucherNo: voucherNo ? String(voucherNo) : undefined,
            voucherType,
            bankAccount: bankAccount || undefined,
            chequeNo: chequeNo || undefined,
            notes: notes || undefined,
            isValid,
            error,
          });
        }

        setParsedRows(parsed);
        setIsProcessing(false);
        toast.success(`Parsed ${parsed.length} rows from file.`);
      } catch (err: any) {
        toast.error("Failed to parse file: " + (err.message || "Invalid format"));
        setIsProcessing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleImport = () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      toast.error("No valid payment rows found to import.");
      return;
    }

    bulkMut.mutate({
      projectId,
      payments: validRows.map((r) => ({
        payeeType: r.payeeType,
        payeeName: r.payeeName,
        partyPan: r.partyPan,
        amount: r.amount,
        tdsDeducted: r.tdsDeducted,
        paymentDate: r.paymentDate,
        paymentMiti: r.paymentMiti,
        paymentMode: r.paymentMode,
        chequeNo: r.chequeNo,
        bankAccount: r.bankAccount,
        category: r.category,
        subCategory: r.subCategory,
        allocationType: "bulk_category",
        accountingSoftware: r.accountingSoftware,
        accountingVoucherNo: r.accountingVoucherNo,
        voucherType: r.voucherType,
        notes: r.notes,
      })),
    });
  };

  const totalImportAmount = parsedRows.filter((r) => r.isValid).reduce((s, r) => s + r.amount, 0);
  const totalImportTds = parsedRows.filter((r) => r.isValid).reduce((s, r) => s + r.tdsDeducted, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden font-sans">
        <DialogHeader className="p-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-primary" />
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Bulk Payment Import (Tally / Swastik ERP / Excel)
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Batch import disbursements from your accounting software daybook directly into project cashflow.
                </DialogDescription>
              </div>
            </div>

            {/* Template Download Pills */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground font-mono">Template:</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadSampleTemplate("tally")}
                className="h-6 text-[11px] gap-1 px-2 font-mono text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
              >
                <Download className="h-3 w-3" /> TallyPrime
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadSampleTemplate("swastik")}
                className="h-6 text-[11px] gap-1 px-2 font-mono text-purple-700 dark:text-purple-300 border-purple-500/30"
              >
                <Download className="h-3 w-3" /> Swastik ERP
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Format Selector & Upload Box */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-foreground">Format Source:</span>
              <button
                type="button"
                onClick={() => setFormatType("tally")}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  formatType === "tally"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                TallyPrime Daybook
              </button>
              <button
                type="button"
                onClick={() => setFormatType("swastik")}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  formatType === "swastik"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Swastik ERP Register
              </button>
              <button
                type="button"
                onClick={() => setFormatType("standard")}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  formatType === "standard"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Standard Excel (.xlsx)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
                id="bulk-payment-file"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="h-8 text-xs gap-1.5 font-bold"
              >
                {isProcessing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                )}
                {fileName ? "Change File" : "Choose Excel / CSV"}
              </Button>
            </div>
          </div>

          {/* Upload Status & Summary Strip */}
          {parsedRows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded bg-muted/40 border text-xs font-mono">
              <div className="flex items-center gap-3">
                <span className="font-bold text-foreground">{fileName}</span>
                <Badge variant="outline" className="text-[10px] h-4">
                  {parsedRows.filter((r) => r.isValid).length} Valid / {parsedRows.length} Total
                </Badge>
              </div>
              <div className="flex items-center gap-4">
                <span>
                  Total Gross: <strong className="text-foreground font-bold">NPR {fmt(totalImportAmount)}</strong>
                </span>
                <span>
                  TDS: <strong className="text-red-600 font-bold">NPR {fmt(totalImportTds)}</strong>
                </span>
                <span>
                  Net: <strong className="text-emerald-600 font-bold">NPR {fmt(totalImportAmount - totalImportTds)}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsedRows.length > 0 ? (
            <div className="border rounded-md overflow-hidden">
              <div className="max-h-[42vh] overflow-y-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10 border-b text-[11px] font-bold">
                    <tr>
                      <th className="p-2 w-8 text-center">#</th>
                      <th className="p-2 w-24">Voucher</th>
                      <th className="p-2 w-44">Category / Sub</th>
                      <th className="p-2">Payee / Ledger</th>
                      <th className="p-2 w-20">PAN</th>
                      <th className="p-2 w-24 text-right">Amount</th>
                      <th className="p-2 w-20 text-right text-red-600">TDS</th>
                      <th className="p-2 w-24 text-right font-bold">Net Paid</th>
                      <th className="p-2 w-20 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedRows.map((r, i) => (
                      <tr
                        key={i}
                        className={`hover:bg-muted/10 transition-colors ${
                          !r.isValid ? "bg-red-50/20 dark:bg-red-950/20" : ""
                        }`}
                      >
                        <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                        <td className="p-2 whitespace-nowrap">
                          {r.accountingVoucherNo ? (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-bold">
                              {r.accountingVoucherNo}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2">
                          <div className="font-bold text-foreground truncate">{r.category}</div>
                          {r.subCategory && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              ↳ {r.subCategory}
                            </div>
                          )}
                        </td>
                        <td className="p-2 font-medium text-foreground truncate max-w-[200px]">
                          {r.payeeName}
                          {r.notes && (
                            <div className="text-[10px] text-muted-foreground font-normal truncate">
                              {r.notes}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">{r.partyPan || "—"}</td>
                        <td className="p-2 text-right font-semibold text-foreground">
                          {fmt(r.amount)}
                        </td>
                        <td className="p-2 text-right text-red-600">
                          {r.tdsDeducted > 0 ? fmt(r.tdsDeducted) : "—"}
                        </td>
                        <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-300">
                          {fmt(r.amount - r.tdsDeducted)}
                        </td>
                        <td className="p-2 text-center">
                          {r.isValid ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 inline" />
                          ) : (
                            <span title={r.error}>
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500 inline" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-2 bg-muted/5">
              <TableIcon className="h-8 w-8 mx-auto text-muted-foreground/60" />
              <div className="text-xs font-semibold text-foreground">
                Drop your Tally or Swastik Daybook Excel sheet here
              </div>
              <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                Download one of the sample templates above or export your daybook from Tally/Swastik and upload here.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="p-3 border-t bg-muted/10 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-7 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleImport}
            disabled={bulkMut.isPending || parsedRows.filter((r) => r.isValid).length === 0}
            className="h-7 text-xs px-5 gap-1.5 font-bold"
          >
            {bulkMut.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Import {parsedRows.filter((r) => r.isValid).length} Payments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
