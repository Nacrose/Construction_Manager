"use client";

import { trpc } from "@/lib/trpc-client";
import { use, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, FileSpreadsheet } from "lucide-react";
import { AnimatedPage } from "@/components/ui/animated-page";

type PayrollItem = {
  staffId: string;
  staffName: string;
  designation: string | null;
  category: string | null;
  dailyWage: number;
  regularDays: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  total: number;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PayrollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [calculated, setCalculated] = useState(false);

  const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

  const { data, isLoading, refetch } = trpc.payroll.calculate.useQuery(
    { projectId: id, month: monthStr },
    { enabled: calculated }
  );

  const payrollItems = data?.payrollItems || [];
  const summary = data?.summary;

  const columns: ColumnDef<PayrollItem>[] = [
    {
      accessorKey: "staffName",
      header: "Staff Name",
      cell: ({ row }) => <span className="font-medium">{row.original.staffName}</span>,
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => <span className="text-muted-foreground capitalize">{row.original.category || "—"}</span>,
    },
    {
      accessorKey: "dailyWage",
      header: () => <div className="text-right">Daily Wage</div>,
      cell: ({ row }) => <div className="text-right">NPR {row.original.dailyWage.toLocaleString()}</div>,
    },
    {
      accessorKey: "regularDays",
      header: () => <div className="text-right">Present Days</div>,
      cell: ({ row }) => <div className="text-right">{row.original.regularDays}</div>,
    },
    {
      accessorKey: "overtimeHours",
      header: () => <div className="text-right">OT Hours</div>,
      cell: ({ row }) => <div className="text-right">{row.original.overtimeHours.toFixed(1)}</div>,
    },
    {
      accessorKey: "regularPay",
      header: () => <div className="text-right">Regular Pay</div>,
      cell: ({ row }) => <div className="text-right">NPR {row.original.regularPay.toLocaleString()}</div>,
    },
    {
      accessorKey: "overtimePay",
      header: () => <div className="text-right">OT Pay</div>,
      cell: ({ row }) => <div className="text-right">NPR {row.original.overtimePay.toLocaleString()}</div>,
    },
    {
      accessorKey: "total",
      header: () => <div className="text-right">Total</div>,
      cell: ({ row }) => (
        <div className="text-right font-semibold">NPR {row.original.total.toLocaleString()}</div>
      ),
    },
  ];

  const handleExport = async () => {
    if (!payrollItems.length) return;
    const XLSX = await import("xlsx");

    const wb = XLSX.utils.book_new();
    const rows: Record<string, string | number>[] = payrollItems.map((item) => ({
      "Staff Name": item.staffName,
      "Category": item.category || "",
      "Daily Wage (NPR)": item.dailyWage,
      "Present Days": item.regularDays,
      "OT Hours": item.overtimeHours,
      "Regular Pay (NPR)": item.regularPay,
      "OT Pay (NPR)": item.overtimePay,
      "Total (NPR)": item.total,
    }));

    // Add summary row
    rows.push({ "Staff Name": "", "Category": "", "Daily Wage (NPR)": 0, "Present Days": 0, "OT Hours": 0, "Regular Pay (NPR)": 0, "OT Pay (NPR)": 0, "Total (NPR)": 0 });
    rows.push({
      "Staff Name": "TOTAL",
      "Category": "",
      "Daily Wage (NPR)": 0,
      "Present Days": 0,
      "OT Hours": 0,
      "Regular Pay (NPR)": summary?.totalRegularPay || 0,
      "OT Pay (NPR)": summary?.totalOvertimePay || 0,
      "Total (NPR)": summary?.grandTotal || 0,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, `Payroll-${monthStr}.xlsx`);
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <AnimatedPage className="space-y-5 pb-8">
      {/* Month Picker + Calculate */}
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Year</label>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Month</label>
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setCalculated(true); refetch(); }}>
          <Calculator className="mr-1.5 h-4 w-4" />Calculate
        </Button>
        {payrollItems.length > 0 && (
          <Button variant="outline" onClick={handleExport}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" />Export to Excel
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Regular Pay</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">NPR {summary.totalRegularPay.toLocaleString()}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Overtime Pay</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">NPR {summary.totalOvertimePay.toLocaleString()}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Grand Total</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-emerald-600">NPR {summary.grandTotal.toLocaleString()}</div></CardContent>
          </Card>
        </div>
      )}

      {/* Results Table */}
      {!calculated ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Calculator className="h-12 w-12 mb-4 opacity-40" />
          <p>Select a month and click Calculate to generate payroll.</p>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-64" />
      ) : payrollItems.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No active staff found for this project.</div>
      ) : (
        <>
          <DataTable tableId="payroll-table" columns={columns} data={payrollItems} searchPlaceholder="Search staff..." searchColumn="staffName" />
          {/* Summary Row */}
          <div className="flex justify-end gap-8 p-4 bg-muted rounded-lg text-sm font-medium">
            <span>Total Regular: NPR {summary?.totalRegularPay.toLocaleString()}</span>
            <span>Total OT: NPR {summary?.totalOvertimePay.toLocaleString()}</span>
            <span className="text-lg">Grand Total: NPR {summary?.grandTotal.toLocaleString()}</span>
          </div>
        </>
      )}
    </AnimatedPage>
  );
}
