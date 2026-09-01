"use client";

import { trpc } from "@/lib/trpc-client";
import { use, useState, useMemo } from "react";
import { z } from "zod";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Check, X, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { AnimatedPage } from "@/components/ui/animated-page";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { formatNpr } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDialogEngine } from "@/components/engine/form-dialog-engine";
import {
  FormDateField,
  FormNumberField,
  FormSelectField,
  FormTextField,
} from "@/components/engine/form-fields";
import { useAction } from "@/hooks/use-action";

const CATEGORIES = ["material", "transport", "labor", "food", "accommodation", "utility", "office", "travel", "other"];
const PAYMENT_MODES = ["cash", "bank_transfer", "cheque", "mobile"];

const PIE_COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#6b7280"];

type Expense = {
  id: string;
  number: string;
  date: Date;
  category: string;
  description: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  paymentMode: string;
  referenceNo: string | null;
  vendorName: string | null;
  status: string;
  createdAt: Date;
  approvedBy: { name: string } | null;
  createdBy: { name: string } | null;
};

type Stats = {
  byCategory: Record<string, number>;
  totalPending: number;
  totalApproved: number;
  totalAll: number;
  totalCount: number;
};

/** Client-side validation for the New Site Expense dialog (server re-validates). */
const newExpenseSchema = z.object({
  category: z.string(),
  date: z.string(),
  description: z.string().min(1, "Description is required"),
  amount: z.number({ message: "Amount is required" }).min(0),
  vatAmount: z.number().min(0).optional(),
  paymentMode: z.string(),
  vendorName: z.string(),
  referenceNo: z.string(),
});

type NewExpenseValues = {
  category: string;
  date: string;
  description: string;
  amount?: number;
  vatAmount?: number;
  paymentMode: string;
  vendorName: string;
  referenceNo: string;
};

const emptyExpense: NewExpenseValues = {
  category: "material",
  date: "",
  description: "",
  amount: undefined,
  vatAmount: undefined,
  paymentMode: "cash",
  vendorName: "",
  referenceNo: "",
};

export default function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState<{ data: string; name: string } | null>(null);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const isPM = projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "coordinator";

  const { data, isLoading } = trpc.siteExpense.list.useQuery({
    projectId: id,
    category: categoryFilter === "all" ? undefined : categoryFilter,
    status: statusFilter === "all" ? undefined : (statusFilter as "pending" | "approved" | "rejected"),
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { data: statsData } = trpc.siteExpense.stats.useQuery({ projectId: id });

  const expenses = data?.expenses || [];
  const stats = statsData as Stats | undefined;

  const pieData = useMemo(() => {
    if (!stats?.byCategory) return [];
    return Object.entries(stats.byCategory).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [stats]);

  // Transition/maintenance actions: useAction owns toast + invalidate + error protocol.
  const approveMutation = useAction(trpc.siteExpense.approve, {
    successMessage: "Expense approved",
    invalidate: (u) => {
      u.siteExpense.list.invalidate({ projectId: id });
      u.siteExpense.stats.invalidate({ projectId: id });
    },
  });

  const rejectMutation = useAction(trpc.siteExpense.reject, {
    successMessage: "Expense rejected",
    invalidate: (u) => {
      u.siteExpense.list.invalidate({ projectId: id });
      u.siteExpense.stats.invalidate({ projectId: id });
    },
  });

  const deleteMutation = useAction(trpc.siteExpense.delete, {
    successMessage: "Expense deleted",
    invalidate: (u) => {
      u.siteExpense.list.invalidate({ projectId: id });
      u.siteExpense.stats.invalidate({ projectId: id });
    },
  });

  const columns: ColumnDef<Expense>[] = [
    {
      accessorKey: "number",
      header: "#",
      cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.number}</span>,
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {format(new Date(row.original.date), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge variant="secondary" className="capitalize text-[10px]">{row.original.category}</Badge>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="truncate max-w-[200px] block text-xs" title={row.original.description}>
          {row.original.description}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: () => <div className="text-right">Amount</div>,
      cell: ({ row }) => <div className="text-right font-mono text-xs">{formatNpr(row.original.amount)}</div>,
    },
    {
      accessorKey: "vatAmount",
      header: () => <div className="text-right">VAT</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-xs text-muted-foreground">
          {row.original.vatAmount > 0 ? formatNpr(row.original.vatAmount) : "—"}
        </div>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: () => <div className="text-right">Total</div>,
      cell: ({ row }) => (
        <div className="text-right font-semibold font-mono text-xs">{formatNpr(row.original.totalAmount)}</div>
      ),
    },
    {
      accessorKey: "paymentMode",
      header: "Payment",
      cell: ({ row }) => (
        <span className="capitalize text-muted-foreground text-xs">{row.original.paymentMode.replace("_", " ")}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const exp = row.original;
        return (
          <div className="flex gap-1">
            {isPM && exp.status === "pending" && (
              <>
                <Button
                  size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  onClick={() => approveMutation.mutate({ id: exp.id })}
                  disabled={approveMutation.isPending}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => rejectMutation.mutate({ id: exp.id })}
                  disabled={rejectMutation.isPending}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {exp.status === "pending" && (
              <Button
                size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-red-600"
                onClick={() => deleteMutation.mutate({ id: exp.id })}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AnimatedPage className="space-y-4 pb-8">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1.5"><CardTitle className="text-xs text-muted-foreground font-mono uppercase">Total Expenses</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{formatNpr(stats?.totalAll || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1.5"><CardTitle className="text-xs text-muted-foreground font-mono uppercase">Pending Approval</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono text-amber-600">{formatNpr(stats?.totalPending || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1.5"><CardTitle className="text-xs text-muted-foreground font-mono uppercase">Approved</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono text-emerald-600">{formatNpr(stats?.totalApproved || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1.5"><CardTitle className="text-xs text-muted-foreground font-mono uppercase">Vouchers Count</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{stats?.totalCount || 0}</div></CardContent>
        </Card>
      </div>

      {/* Category Pie Chart + Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-mono uppercase">By Category</CardTitle></CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatNpr(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-mono uppercase">Category Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(stats?.byCategory || {}).map(([cat, total]) => (
                <div key={cat} className="flex justify-between p-2 border rounded-lg text-xs font-mono">
                  <span className="capitalize text-muted-foreground">{cat}</span>
                  <span className="font-bold text-foreground">{formatNpr(total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + New Expense */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-mono">Category</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36 h-8 text-xs font-mono"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-mono">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs font-mono"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-mono">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-8 text-xs font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-mono">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-8 text-xs font-mono" />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="h-8 text-xs gap-1.5 font-mono">
          <Plus className="h-3.5 w-3.5" />New Expense
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <DataTable tableId="expenses-table" columns={columns} data={expenses} searchPlaceholder="Search expenses..." searchColumn="description" />
      )}

      {/* New Site Expense — FormDialogEngine (Tier 2): framing, state, validation,
          toast, invalidation, close/reset owned by the engine. Receipt file input and
          the live total readout are page-specific slots via the render-prop children
          (escape hatch without fork); the receipt blob itself lives in page state
          because it is a file, not a form field. */}
      <NewExpenseEngineDialog
        projectId={id}
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setReceiptFile(null);
        }}
        receiptFile={receiptFile}
        onReceiptFile={setReceiptFile}
      />
    </AnimatedPage>
  );
}

function NewExpenseEngineDialog({
  projectId,
  open,
  onOpenChange,
  receiptFile,
  onReceiptFile,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptFile: { data: string; name: string } | null;
  onReceiptFile: (f: { data: string; name: string } | null) => void;
}) {
  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onReceiptFile({ data: reader.result as string, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  return (
    <FormDialogEngine
      open={open}
      onOpenChange={onOpenChange}
      title="New Site Expense"
      description="Log a site purchase or payment. Approved vouchers feed the day book and payables."
      size="md"
      initialValues={emptyExpense}
      schema={newExpenseSchema}
      mutation={trpc.siteExpense.create}
      buildInput={(v) => ({
        projectId,
        category: v.category,
        description: v.description,
        amount: v.amount ?? 0,
        vatAmount: v.vatAmount ?? 0,
        paymentMode: v.paymentMode,
        date: v.date || undefined,
        vendorName: v.vendorName || undefined,
        referenceNo: v.referenceNo || undefined,
        receiptData: receiptFile?.data,
        receiptName: receiptFile?.name,
      })}
      invalidate={(u) => {
        u.siteExpense.list.invalidate({ projectId });
        u.siteExpense.stats.invalidate({ projectId });
      }}
      successMessage="Expense created"
      submitLabel="Create Expense"
    >
      {(ctx) => (
        <>
          <FormSelectField
            name="category"
            label="Category"
            required
            options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
          />
          <FormDateField name="date" label="Date" />
          <FormTextField
            name="description"
            label="Description"
            required
            placeholder="What was this expense for?"
            colSpan="full"
          />
          <FormNumberField name="amount" label="Amount (NPR)" required min={0} step="0.01" />
          <FormNumberField name="vatAmount" label="VAT (NPR)" min={0} step="0.01" />
          <div className="col-span-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#f8fbfe] border border-[#e2edf7] text-xs font-mono">
            <span className="text-slate-500">Total (incl. VAT)</span>
            <span className="font-bold text-[#0284c7]">
              {formatNpr((ctx.values.amount || 0) + (ctx.values.vatAmount || 0))}
            </span>
          </div>
          <FormSelectField
            name="paymentMode"
            label="Payment Mode"
            options={PAYMENT_MODES.map((m) => ({ value: m, label: m.replace("_", " ") }))}
          />
          <FormTextField name="vendorName" label="Vendor / Payee" placeholder="Optional" />
          <FormTextField name="referenceNo" label="Reference No." placeholder="Optional" />
          <div className="col-span-full space-y-1.5">
            <Label className="text-[11px] font-semibold text-slate-700">Receipt Photo</Label>
            <Input type="file" accept="image/*" onChange={handleReceiptChange} className="text-xs" />
            {receiptFile && <p className="text-[10px] text-emerald-700 font-mono">{receiptFile.name}</p>}
          </div>
        </>
      )}
    </FormDialogEngine>
  );
}
