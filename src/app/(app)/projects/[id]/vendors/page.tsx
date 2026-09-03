"use client";

import { use, useState, Suspense } from "react";
import Link from "next/link";
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
import { Plus, Building2, MoreVertical, AlertCircle, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VendorDetailFullPage } from "./components/vendor-detail-view";
import { CreateVendorDialog } from "./components/create-vendor-dialog";
import { EditVendorDialog } from "./components/edit-vendor-dialog";
import { formatNpr } from "@/lib/currency";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const partnersQuery = trpc.partner.listPartners.useInfiniteQuery(
    {
      projectId: id,
      type: filterType === "all" ? undefined : filterType,
    },
    { getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined) }
  );

  const partners = partnersQuery.data ? partnersQuery.data.pages.flatMap((p) => p.partners) : [];
  const canWrite = Boolean(projectInfo?.myRole);

  const deleteMutation = trpc.partner.deletePartner.useMutation({
    onSuccess: () => {
      toast.success("Vendor deleted successfully");
      utils.partner.listPartners.invalidate({ projectId: id });
      setDeleteTarget(null);
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
          <span className="font-mono text-[11px] bg-muted dark:bg-[var(--navy-mid)] text-foreground/80 dark:text-foreground/80 px-1.5 py-0.5 rounded font-semibold">
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
        <div className="font-semibold text-foreground flex items-center gap-1.5 font-sans">
          <Building2 className="h-3.5 w-3.5 text-info shrink-0" />
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
              "capitalize font-mono text-[10px]",
              val === "both"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                : val === "material_supplier"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info/80"
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
          <div className="space-y-0.5 text-xs text-muted-foreground font-mono">
            {r.contact && <div className="font-medium text-foreground font-sans">{r.contact}</div>}
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
          <div className="text-xs text-muted-foreground font-mono">
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
          <span className="text-xs font-semibold text-info dark:text-info/80 font-mono">
            📦 {len} items
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "balance_due",
      header: "Outstanding Due",
      cell: ({ row }) => {
        const fin = row.original.financialSummary;
        const due = fin?.balanceDue || 0;
        if (due > 0) {
          return (
            <div className="flex items-center gap-2 font-mono">
              <span className="font-bold text-red-600 dark:text-red-400 text-xs">
                {formatNpr(due)}
              </span>
              <Link
                href={`/projects/${id}/payments`}
                className="inline-flex items-center gap-0.5 text-[10px] bg-success/15 dark:bg-success/60 text-success dark:text-success/80 font-sans font-bold px-1.5 py-0.5 rounded hover:bg-success/20 transition"
              >
                <CreditCard className="h-2.5 w-2.5" />
                Pay
              </Link>
            </div>
          );
        }
        return <span className="text-xs text-muted-foreground font-mono">✓ Settled</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          className={cn(
            "capitalize text-[10px] font-mono",
            row.original.status === "active"
              ? "bg-success/15 text-success dark:bg-success dark:text-success/80"
              : "bg-muted text-muted-foreground"
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
              <DropdownMenuContent align="end" className="backdrop-blur-md bg-black/85 border-white/10 text-white font-mono text-xs">
                <DropdownMenuItem onClick={() => setEditPartner(partner)}>
                  Edit Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-400 focus:text-red-400 focus:bg-red-950/50"
                  onClick={() => setDeleteTarget({ id: partner.id, name: partner.name })}
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

  const totalVendors = partners.length;
  const totalBilled = partners.reduce((s, p) => s + (p.financialSummary?.totalBilled || 0), 0);
  const totalDue = partners.reduce((s, p) => s + (p.financialSummary?.balanceDue || 0), 0);

  return (
    <>
      <ModuleTabs projectId={id} tabs={RES_TABS} />
      <AnimatedPage className="space-y-5 pb-8 font-sans">
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
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 font-mono">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase">Registered Vendors</div>
                <div className="mt-1 text-2xl font-bold text-foreground">{totalVendors}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Suppliers &amp; service providers</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase">Total Invoiced (Net)</div>
                <div className="mt-1 text-2xl font-bold text-foreground">
                  {formatNpr(totalBilled)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Cumulative vendor billings</div>
              </div>
              <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-4">
                <div className="flex items-center justify-between text-xs text-red-700 dark:text-red-300 uppercase font-bold">
                  <span className="flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Total Due (तिर्न बाँकी)</span>
                  <Link href={`/projects/${id}/payments`} className="text-xs text-red-600 dark:text-red-400 hover:underline">
                    View Payables →
                  </Link>
                </div>
                <div className="mt-1 text-2xl font-bold text-red-900 dark:text-red-100">
                  {formatNpr(totalDue)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Unsettled vendor balances</div>
              </div>
            </div>

            {/* Page Actions */}
            <div className="flex justify-between items-center gap-4 mb-2">
              <div className="flex gap-1 rounded-md bg-muted/60 p-0.5 w-fit font-mono">
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
                      "px-3 py-1.5 text-xs font-semibold rounded transition",
                      filterType === tid
                        ? "bg-background text-foreground shadow-xs"
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
                    <Button size="sm" className="gap-1.5 font-mono">
                      <Plus className="h-4 w-4" />
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

            {/* Table */}
            {partnersQuery.isLoading ? (
              <Skeleton className="h-96 w-full rounded-xl" />
            ) : (
              <DataTable
                columns={columns}
                data={partners}
                searchColumn="name"
                searchPlaceholder="Search vendor name, code, contact..."
                onRowClick={(row) => setDetailPartner(row)}
                footerContent={
                  partnersQuery.hasNextPage ? (
                    <div className="flex justify-center py-2">
                      <Button variant="outline" size="sm" onClick={() => partnersQuery.fetchNextPage()} disabled={partnersQuery.isFetchingNextPage}>
                        {partnersQuery.isFetchingNextPage ? "Loading…" : "Load more vendors"}
                      </Button>
                    </div>
                  ) : undefined
                }
              />
            )}
          </>
        )}

        {/* Edit Vendor Dialog */}
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

        {/* Confirmation Modal for Deleting Vendor */}
        {deleteTarget && (
          <ConfirmDialog
            open={Boolean(deleteTarget)}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
            title="Delete Vendor Record?"
            description={`Are you sure you want to delete vendor "${deleteTarget.name}"? This action cannot be undone.`}
            variant="destructive"
            confirmLabel="Delete Vendor"
            isLoading={deleteMutation.isPending}
            onConfirm={async () => {
              await deleteMutation.mutateAsync({ partnerId: deleteTarget.id });
            }}
          />
        )}
      </AnimatedPage>
    </>
  );
}

export default function VendorsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <VendorsPageContent params={params} />
    </Suspense>
  );
}
