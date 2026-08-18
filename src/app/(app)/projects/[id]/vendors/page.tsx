"use client";

import { use, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { trpc } from "@/lib/trpc-client";
import { ModuleTabs } from "@/components/module-tabs";
import { AnimatedPage } from "@/components/ui/animated-page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Building2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VendorDetailFullPage } from "./components/vendor-detail-view";
import { CreateVendorDialog } from "./components/create-vendor-dialog";
import { EditVendorDialog } from "./components/edit-vendor-dialog";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

function VendorsPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const defaultFilter =
    typeParam === "material_supplier" || typeParam === "equipment_vendor" ? typeParam : "all";

  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "material_supplier" | "equipment_vendor">(
    defaultFilter
  );
  const [editPartner, setEditPartner] = useState<any | null>(null);
  const [detailPartner, setDetailPartner] = useState<any | null>(null);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.partner.listPartners.useQuery({
    projectId: id,
    type: filterType === "all" ? undefined : filterType,
  });

  const partners = data?.partners ?? [];
  const canWrite = Boolean(
    projectInfo?.myRole &&
      projectInfo.myRole !== "client" &&
      projectInfo.myRole !== "inspector"
  );

  const deleteMutation = trpc.partner.deletePartner.useMutation({
    onSuccess: () => {
      toast.success("Vendor deleted successfully");
      utils.partner.listPartners.invalidate({ projectId: id });
    },
    onError: (e) => toast.error(e.message),
  });

  // Track currently open detail partner by refreshing from list
  const activeDetailPartner = detailPartner
    ? partners.find((p) => p.id === detailPartner.id)
    : null;

  // Define Columns for the Vendors Table
  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) =>
        row.original.code ? (
          <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-semibold">
            {row.original.code}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "name",
      header: "Vendor Name",
      cell: ({ row }) => (
        <div className="font-semibold text-foreground flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          {row.original.name}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const val = row.original.type;
        return (
          <Badge
            variant="outline"
            className={cn(
              "capitalize font-normal text-[10px]",
              val === "both"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                : val === "material_supplier"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            )}
          >
            {val.replace("_", " ")}
          </Badge>
        );
      },
    },
    {
      id: "contact_details",
      header: "Contact Details",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {r.contact && <div className="font-medium text-foreground">{r.contact}</div>}
            {r.phone && <div>{r.phone}</div>}
            {r.email && <div className="text-[10px] truncate max-w-[150px]">{r.email}</div>}
          </div>
        );
      },
    },
    {
      id: "registration",
      header: "PAN / Registration",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="text-xs text-muted-foreground">
            {r.pan && <div>PAN: {r.pan}</div>}
            {r.regNumber && <div>Reg: {r.regNumber}</div>}
            {!r.pan && !r.regNumber && "—"}
          </div>
        );
      },
    },
    {
      id: "supplies_count",
      header: "Supplies",
      cell: ({ row }) => {
        const len = row.original.supplies?.length ?? 0;
        return len > 0 ? (
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            📦 {len} items
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          className={cn(
            "capitalize text-[10px]",
            row.original.status === "active"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-slate-100 text-slate-600"
          )}
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const partner = row.original;
        if (!canWrite) return null;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditPartner(partner)}>
                  Edit Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this vendor?")) {
                      deleteMutation.mutate({ partnerId: partner.id });
                    }
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <ModuleTabs projectId={id} tabs={RES_TABS} />
      <AnimatedPage className="space-y-5 pb-8">
        {activeDetailPartner ? (
          <VendorDetailFullPage
            partner={activeDetailPartner}
            projectId={id}
            canWrite={canWrite}
            onBack={() => setDetailPartner(null)}
            onDone={() => utils.partner.listPartners.invalidate({ projectId: id })}
          />
        ) : (
          <>
            {/* Page Actions */}
            <div className="flex justify-between items-center gap-4 mb-2">
              <div className="flex gap-1 rounded-md bg-muted/60 p-0.5 w-fit">
                {(
                  [
                    { id: "all", label: "All Vendors" },
                    { id: "material_supplier", label: "Material Suppliers" },
                    { id: "equipment_vendor", label: "Equipment Vendors" },
                  ] as const
                ).map(({ id: tid, label }) => (
                  <button
                    key={tid}
                    onClick={() => setFilterType(tid)}
                    className={cn(
                      "rounded px-3 py-1.5 text-xs font-medium transition-all",
                      filterType === tid
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {canWrite && (
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Vendor
                    </Button>
                  </DialogTrigger>
                  <CreateVendorDialog
                    projectId={id}
                    onDone={() => {
                      setAddOpen(false);
                      utils.partner.listPartners.invalidate({ projectId: id });
                    }}
                  />
                </Dialog>
              )}
            </div>

            {/* Vendors Table View */}
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <DataTable
                tableId="vendors-table-list"
                columns={columns}
                data={partners}
                searchPlaceholder="Search vendors by name..."
                searchColumn="name"
                onRowClick={(row) => setDetailPartner(row)}
              />
            )}
          </>
        )}

        {/* Edit Dialog */}
        {editPartner && (
          <EditVendorDialog
            partner={editPartner}
            onClose={() => setEditPartner(null)}
            onDone={() => {
              setEditPartner(null);
              utils.partner.listPartners.invalidate({ projectId: id });
            }}
          />
        )}
      </AnimatedPage>
    </>
  );
}

export default function VendorsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <VendorsPageContent params={params} />
    </Suspense>
  );
}
