"use client";

import { trpc } from "@/lib/trpc-client";
import { use, useMemo, useState } from "react";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Check, X, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/ui/animated-page";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { formatNpr } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDialogEngine } from "@/components/ui/form-dialog-engine";
import { useRegister } from "@/hooks/use-register";

const CATEGORIES = ["material", "transport", "labor", "food", "accommodation", "utility", "office", "travel", "other"];
const PAYMENT_MODES = ["cash", "bank_transfer", "cheque", "mobile"];
const PIE_COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#4a8b57", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#6b7280"];

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

export default function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const reg = useRegister();
  const utils = trpc.useUtils();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: projectInfo } = trpc.project.get.useQuery({ id: projectId }, { staleTime: 300_000 });
  const isPM = projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "coordinator";

  const { data, isLoading } = trpc.siteExpense.list.useQuery({
    projectId,
    status: reg.status === "all" ? undefined : (reg.status as "pending" | "approved" | "rejected"),
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { data: statsData } = trpc.siteExpense.stats.useQuery({ projectId });

  const rawExpenses = (data?.expenses || []) as Expense[];
  const stats = statsData as Stats | undefined;

  const expenses = useMemo(() => {
    if (!reg.search) return rawExpenses;
    const q = reg.search.toLowerCase();
    return rawExpenses.filter(
      (e) =>
        e.description.toLowerCase().includes(q) ||
        e.number.toLowerCase().includes(q) ||
        (e.vendorName && e.vendorName.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q)
    );
  }, [rawExpenses, reg.search]);

  const pieData = useMemo(() => {
    if (!stats?.byCategory) return [];
    return Object.entries(stats.byCategory).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [stats]);

  const approveMutation = trpc.siteExpense.approve.useMutation({
    onSuccess: () => {
      utils.siteExpense.list.invalidate({ projectId });
      utils.siteExpense.stats.invalidate({ projectId });
      toast.success("Expense approved");
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.siteExpense.reject.useMutation({
    onSuccess: () => {
      utils.siteExpense.list.invalidate({ projectId });
      utils.siteExpense.stats.invalidate({ projectId });
      toast.success("Expense rejected");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.siteExpense.delete.useMutation({
    onSuccess: () => {
      utils.siteExpense.list.invalidate({ projectId });
      utils.siteExpense.stats.invalidate({ projectId });
      toast.success("Expense deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const columns: ConstructionTableColumn<Expense>[] = [
    {
      key: "number",
      header: "#",
      render: (_, exp) => <span className="font-mono text-xs font-semibold">{exp.number}</span>,
    },
    {
      key: "date",
      header: "Date",
      render: (_, exp) => (
        <span className="font-mono text-xs text-muted-foreground">
          {format(new Date(exp.date), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (_, exp) => <span className="capitalize font-mono text-xs text-muted-foreground">{exp.category}</span>,
    },
    {
      key: "description",
      header: "Description",
      render: (_, exp) => (
        <span className="truncate max-w-[220px] block text-xs" title={exp.description}>
          {exp.description}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (_, exp) => <span className="font-mono text-xs">{formatNpr(exp.amount)}</span>,
    },
    {
      key: "vatAmount",
      header: "VAT",
      align: "right",
      render: (_, exp) => (
        <span className="font-mono text-xs text-muted-foreground">
          {exp.vatAmount > 0 ? formatNpr(exp.vatAmount) : "—"}
        </span>
      ),
    },
    {
      key: "totalAmount",
      header: "Total",
      align: "right",
      render: (_, exp) => <span className="font-semibold font-mono text-xs">{formatNpr(exp.totalAmount)}</span>,
    },
    {
      key: "paymentMode",
      header: "Payment",
      render: (_, exp) => (
        <span className="capitalize text-muted-foreground text-xs">{exp.paymentMode.replace("_", " ")}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (_, exp) => <StatusBadge status={exp.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (_, exp) => (
        <div className="flex justify-end gap-1">
          {isPM && exp.status === "pending" && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-success hover:text-success hover:bg-success/10"
                onClick={() => approveMutation.mutate({ id: exp.id })}
                disabled={approveMutation.isPending}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => rejectMutation.mutate({ id: exp.id })}
                disabled={rejectMutation.isPending}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {exp.status === "pending" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground hover:text-red-600"
              onClick={() => deleteMutation.mutate({ id: exp.id })}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AnimatedPage className="space-y-4 pb-8">
      {/* Stats Summary */}
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
          <CardContent><div className="text-xl font-bold font-mono text-success">{formatNpr(stats?.totalApproved || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1.5"><CardTitle className="text-xs text-muted-foreground font-mono uppercase">Vouchers Count</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{stats?.totalCount || 0}</div></CardContent>
        </Card>
      </div>

      {/* Category Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-mono uppercase">By Category</CardTitle></CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
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

      {/* Date Range Bar + Action Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs font-mono">From:</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-8 text-xs font-mono" />
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs font-mono">To:</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-8 text-xs font-mono" />
          </div>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5 font-mono" onClick={() => reg.openCreate()}>
          <Plus className="h-3.5 w-3.5" />New Expense
        </Button>
      </div>

      {/* Central Table Engine */}
      <ConstructionTable
        data={rawExpenses}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search expenses by number, payee, description..."
        searchFilterKeys={["number", "description", "category", "vendorName", "paymentMode"]}
      />

      {/* Standardized Form Dialog Engine */}
      <FormDialogEngine
        open={reg.dialog.open && reg.dialog.type === "create"}
        onOpenChange={(open) => !open && reg.closeDialog()}
        title="Record Site Expense"
        description="Submit site petty cash or direct supplier expense voucher."
      >
        <NewExpenseForm projectId={projectId} onDone={() => reg.closeDialog()} />
      </FormDialogEngine>
    </AnimatedPage>
  );
}


function NewExpenseForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("0");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [vendorName, setVendorName] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [date, setDate] = useState("");
  const [receiptFile, setReceiptFile] = useState<{ data: string; name: string } | null>(null);

  const mutation = trpc.siteExpense.create.useMutation({
    onSuccess: () => {
      utils.siteExpense.list.invalidate({ projectId });
      utils.siteExpense.stats.invalidate({ projectId });
      toast.success("Expense created");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptFile({ data: reader.result as string, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      projectId,
      category,
      description,
      amount: parseFloat(amount) || 0,
      vatAmount: parseFloat(vatAmount) || 0,
      paymentMode,
      vendorName: vendorName || undefined,
      referenceNo: referenceNo || undefined,
      date: date || undefined,
      receiptData: receiptFile?.data,
      receiptName: receiptFile?.name,
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Category *</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Description *</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="What was this expense for?" className="h-8 text-xs bg-white/5 border-white/10 text-white" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Amount (NPR) *</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required min="0" step="0.01" className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">VAT (NPR)</Label>
          <Input type="number" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} min="0" step="0.01" className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Total</Label>
          <Input value={formatNpr((parseFloat(amount) || 0) + (parseFloat(vatAmount) || 0))} readOnly className="h-8 text-xs bg-white/10 border-white/10 text-success/80 font-mono font-bold" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Payment Mode</Label>
          <Select value={paymentMode} onValueChange={setPaymentMode}>
            <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_MODES.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Vendor / Payee</Label>
          <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Optional" className="h-8 text-xs bg-white/5 border-white/10 text-white" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Reference No.</Label>
        <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Optional" className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Receipt Photo</Label>
        <Input type="file" accept="image/*" onChange={handleReceiptChange} className="text-xs bg-white/5 border-white/10 text-white file:text-xs file:bg-white/10 file:text-white file:border-0 file:rounded-md file:mr-2" />
        {receiptFile && <p className="text-xs text-success/80 font-mono">{receiptFile.name}</p>}
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending} className="h-8 text-xs font-mono bg-success hover:bg-success text-white">
          {mutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Create Expense
        </Button>
      </div>
    </form>
  );
}
