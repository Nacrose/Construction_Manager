"use client";

import { format } from "date-fns";
import { ArrowUpDown } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";

export type Transaction = {
  id: string;
  type: string;
  quantity: number;
  unit: string;
  rate: number;
  reference: string | null;
  remarks: string | null;
  date: Date;
  material: { name: string; code: string | null; unit: string };
  createdBy: { name: string } | null;
  gateEntry: { id: string; number: string; vehicleNo: string } | null;
  purchaseOrder: {
    id: string;
    number: string;
    supplier?: { name: string } | null;
    partner?: { name: string } | null;
    requisition: { id: string; number: string } | null;
  } | null;
};

export function MaterialsTransactionsTab({
  isTxnsLoading,
  transactions,
}: {
  isTxnsLoading: boolean;
  transactions: Transaction[];
}) {
  const transactionColumns: ColumnDef<Transaction>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4 hover:bg-transparent"
        >
          Date <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {format(new Date(row.original.date), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      id: "material_name",
      accessorFn: (row) => row.material.name,
      header: "Material",
      cell: ({ row }) => (
        <span className="font-semibold text-foreground">{row.original.material.name}</span>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const t = row.original.type;
        let color = "bg-muted text-muted-foreground";
        if (t === "receive")
          color = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
        else if (t === "issue")
          color = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
        else if (t === "transfer")
          color = "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info/80";
        return (
          <Badge variant="secondary" className={`${color} text-[10px] font-medium capitalize`}>
            {t}
          </Badge>
        );
      },
    },
    {
      id: "purchase_order",
      header: "PO / PR",
      cell: ({ row }) => {
        const po = row.original.purchaseOrder;
        return po ? (
          <Badge
            variant="outline"
            className="font-mono text-[10px] bg-purple-50/50 text-purple-700 dark:text-purple-300 dark:bg-purple-950/20 border-purple-200"
          >
            {po.number}
          </Badge>
        ) : (
          <span className="text-muted-foreground/30 text-xs">—</span>
        );
      },
    },
    {
      id: "gate_pass",
      header: "Gate Pass",
      cell: ({ row }) => {
        const gp = row.original.gateEntry;
        return gp ? (
          <Badge
            variant="outline"
            className="font-mono text-[10px] bg-amber-50/50 text-amber-700 dark:text-amber-300 dark:bg-amber-950/20 border-amber-200"
            title={`Vehicle: ${gp.vehicleNo}`}
          >
            {gp.number}
          </Badge>
        ) : (
          <span className="text-muted-foreground/30 text-xs">—</span>
        );
      },
    },
    {
      accessorKey: "quantity",
      header: () => <div className="text-right">Quantity</div>,
      cell: ({ row }) => (
        <div className="text-right font-bold">
          {row.original.quantity.toLocaleString()} {row.original.unit}
        </div>
      ),
    },
    {
      accessorKey: "rate",
      header: () => <div className="text-right">Rate (NPR)</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-muted-foreground">
          {row.original.rate?.toLocaleString() ?? "—"}
        </div>
      ),
    },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{row.original.reference || "—"}</span>
      ),
    },
    {
      accessorKey: "createdBy",
      header: "Logged By",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {row.original.createdBy?.name ?? "Auto"}
        </span>
      ),
    },
  ];

  if (isTxnsLoading) {
    return <Skeleton className="h-80 rounded-xl" />;
  }

  return (
    <div className="space-y-2">
      <DataTable
        tableId="material-transactions-table"
        columns={transactionColumns}
        data={transactions}
        searchPlaceholder="Search material transactions..."
        searchColumn="material_name"
      />
    </div>
  );
}
