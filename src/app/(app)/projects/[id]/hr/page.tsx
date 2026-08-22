"use client";

import { trpc } from "@/lib/trpc-client";
import { use, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {Plus, Users, Phone, ArrowUpDown, UserCog} from "lucide-react";
import { format } from "date-fns";
import { StaffRolesTab } from "./staff-roles-tab";
import { AddStaffDialog } from "./dialogs/add-staff-dialog";

type Staff = {
  id: string; name: string; designation: string | null; category: string | null;
  phone: string | null; dailyWage: number; status: string; joinedDate: Date | null;
};

type Attendance = {
  id: string; date: Date; status: string; hours: number; overtime: number;
  staff: { name: string; designation: string | null };
};

const CATEGORY_COLORS: Record<string, string> = {
  skilled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  unskilled: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  supervisor: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  staff: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
};

const ATTENDANCE_COLORS: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  absent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  half_day: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  leave: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  overtime: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
};

import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { cn } from "@/lib/utils";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

export default function HrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState("staff");
  const [addOpen, setAddOpen] = useState(false);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.hr.list.useQuery({
    projectId: id,
    tab: tab as "staff" | "attendance",
  });

  const canWrite = projectInfo?.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector";

  const staffColumns: ColumnDef<Staff>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4 hover:bg-transparent"
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "designation",
      header: "Designation",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.designation || "—"}</span>,
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => {
        const cat = row.original.category;
        return cat ? (
          <Badge variant="secondary" className={`capitalize ${CATEGORY_COLORS[cat] ?? ""}`}>
            {cat}
          </Badge>
        ) : "—";
      },
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => {
        const phone = row.original.phone;
        return phone ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Phone className="h-3 w-3" />
            {phone}
          </span>
        ) : "—";
      },
    },
    {
      accessorKey: "dailyWage",
      header: () => <div className="text-right">Daily wage</div>,
      cell: ({ row }) => <div className="text-right">NPR {row.original.dailyWage.toLocaleString()}</div>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.original.status}</Badge>,
    },
  ];

  const attendanceColumns: ColumnDef<Attendance>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4 hover:bg-transparent"
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span>{format(new Date(row.original.date), "dd MMM yyyy")}</span>,
    },
    {
      accessorKey: "staff.name",
      header: "Staff",
      cell: ({ row }) => <span className="font-medium">{row.original.staff.name}</span>,
    },
    {
      accessorKey: "staff.designation",
      header: "Designation",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.staff.designation || "—"}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge variant="secondary" className={`capitalize ${ATTENDANCE_COLORS[status] ?? ""}`}>
            {status.replace("_", " ")}
          </Badge>
        );
      },
    },
    {
      accessorKey: "hours",
      header: () => <div className="text-right">Hours</div>,
      cell: ({ row }) => <div className="text-right">{row.original.hours}</div>,
    },
    {
      accessorKey: "overtime",
      header: () => <div className="text-right">Overtime</div>,
      cell: ({ row }) => (
        <div className="text-right">
          {row.original.overtime > 0 ? `${row.original.overtime} hr` : "—"}
        </div>
      ),
    },
  ];

  return (
    <>
    <ModuleTabs projectId={id} tabs={RES_TABS} />
    <AnimatedPage className="space-y-5 pb-8">

      {/* ── Page Actions ─────────────────────────────────────── */}
      <div className="flex justify-end gap-2 mb-5">
        {canWrite && tab === "staff" && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Add Staff</Button>
            </DialogTrigger>
            <AddStaffDialog projectId={id} onDone={() => setAddOpen(false)} />
          </Dialog>
        )}
      </div>

      {/* ── Inner Tab Navigation ──────────────────────────────── */}
      <div className="flex gap-0 border-b border-border">
        {([
          { id: "staff",      label: "Staff",      Icon: Users },
          { id: "attendance", label: "Attendance", Icon: ArrowUpDown },
          { id: "roles",      label: "Roles",      Icon: UserCog },
        ] as const).map(({ id: tabId, label, Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === tabId
                ? "border-sky-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── STAFF ─────────────────────────────────────────── */}
      {tab === "staff" && (
        isLoading ? <Skeleton className="h-64" /> : (
          <DataTable tableId="hr-table-1"
            columns={staffColumns}
            data={data?.staff || []}
            searchPlaceholder="Search staff..."
            searchColumn="name"
          />
        )
      )}

      {/* ── ATTENDANCE ────────────────────────────────────── */}
      {tab === "attendance" && (
        isLoading ? <Skeleton className="h-64" /> : (
          <DataTable tableId="hr-table-2"
            columns={attendanceColumns}
            data={data?.attendance || []}
            searchPlaceholder="Search attendance..."
            searchColumn="staff_name"
          />
        )
      )}

      {/* ── ROLES ─────────────────────────────────────────── */}
      {tab === "roles" && <StaffRolesTab projectId={id} canWrite={!!canWrite} />}

    </AnimatedPage>
    </>
  );
}
