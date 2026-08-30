"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowRightLeft, CheckCircle2, Truck, Plus, Loader2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { InterSiteTransferDialog } from "@/components/inventory/inter-site-transfer-dialog";

interface InterSiteTransfersTabProps {
  projectId: string;
  canWrite: boolean;
}

export function InterSiteTransfersTab({ projectId, canWrite }: InterSiteTransfersTabProps) {
  const utils = trpc.useUtils();
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const { data, isLoading } = trpc.interSiteTransfer.list.useQuery({
    projectId,
  });

  const receiveMutation = trpc.interSiteTransfer.receiveMaterial.useMutation({
    onSuccess: () => {
      toast.success("Shipment received and added to site inventory!");
      utils.interSiteTransfer.list.invalidate();
      utils.material.list.invalidate();
      setReceivingId(null);
    },
    onError: (e) => {
      toast.error(e.message);
      setReceivingId(null);
    },
  });

  const transfers = (data?.transfers || []) as any[];

  function handleReceive(transfer: any) {
    setReceivingId(transfer.id);
    receiveMutation.mutate({
      transferId: transfer.id,
      receivedQty: Number(transfer.quantity),
      damageLossQty: 0,
      remarks: "Direct 1-Click site GRN receipt",
    });
  }

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "transferNo",
      header: "Transfer #",
      sortable: true,
      searchable: true,
      render: (val, t) => (
        <div className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
          {t.originProjectId === projectId ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-amber-400" />
          ) : (
            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
          )}
          <span>{t.transferNo}</span>
        </div>
      ),
    },
    {
      key: "direction",
      header: "Movement",
      render: (val, t) => {
        const isOutbound = t.originProjectId === projectId;
        return (
          <div className="text-xs">
            <span className={`font-semibold ${isOutbound ? "text-amber-400" : "text-emerald-400"}`}>
              {isOutbound ? `OUT ➔ ${t.destinationProject?.name || "Other Site"}` : `IN ⬅ ${t.originProject?.name || "Other Site"}`}
            </span>
            <div className="text-[10px] text-gray-400">
              {isOutbound ? `Code: ${t.destinationProject?.code}` : `Code: ${t.originProject?.code}`}
            </div>
          </div>
        );
      },
    },
    {
      key: "material",
      header: "Material & Qty",
      sortable: true,
      searchable: true,
      render: (val, t) => (
        <div className="text-xs">
          <div className="font-semibold text-white">{t.material?.name || "Material"}</div>
          <div className="font-mono text-emerald-400 font-bold">
            {Number(t.quantity).toLocaleString()} {t.unit}
          </div>
        </div>
      ),
    },
    {
      key: "valuation",
      header: "Internal Value",
      sortable: true,
      render: (val, t) => (
        <div className="text-xs font-mono">
          <div className="text-white font-bold">{formatNpr(Number(t.totalAmount || 0))}</div>
          <div className="text-[10px] text-gray-400">@{formatNpr(Number(t.transferRate || 0))}/{t.unit}</div>
        </div>
      ),
    },
    {
      key: "transport",
      header: "Vehicle & Chalan",
      render: (val, t) => (
        <div className="text-xs">
          <div className="text-gray-200 font-mono">{t.vehicleNo || "—"}</div>
          <div className="text-[10px] text-gray-400">{t.chalanNo || t.driverName || "Direct Move"}</div>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (val, t) => (
        <div className="text-xs text-gray-300 font-mono">
          {t.dispatchDate ? format(new Date(t.dispatchDate), "dd MMM yyyy") : "—"}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (val, t) => {
        if (t.status === "received") {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3" /> Received
            </span>
          );
        }
        if (t.status === "in_transit" || t.status === "dispatched") {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Truck className="h-3 w-3 animate-pulse" /> In Transit
            </span>
          );
        }
        return <StatusBadge status={t.status} />;
      },
    },
    {
      key: "actions",
      header: "Action",
      render: (val, t) => {
        const isInbound = t.destinationProjectId === projectId;
        const isPending = t.status === "in_transit" || t.status === "dispatched";

        if (isInbound && isPending && canWrite) {
          return (
            <Button
              size="sm"
              onClick={() => handleReceive(t)}
              disabled={receivingId === t.id}
              className="h-7 px-3 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm"
            >
              {receivingId === t.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Accept GRN"
              )}
            </Button>
          );
        }

        return <span className="text-[11px] text-gray-500 font-mono">—</span>;
      },
    },
  ];

  return (
    <div className="space-y-3">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-3 rounded-2xl border border-white/10 bg-[#0c1015]">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold text-white">Inter-Site Resource Movements (आन्तरिक सामाग्री स्थानान्तरण)</span>
          <span className="text-[11px] text-gray-400">— Transfer surplus materials between sites with automatic project cost balancing</span>
        </div>

        {canWrite && (
          <Button
            size="sm"
            onClick={() => setTransferDialogOpen(true)}
            className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5 shadow-md rounded-xl"
          >
            <Plus className="h-3.5 w-3.5" />
            + New Transfer
          </Button>
        )}
      </div>

      {/* Table */}
      <ConstructionTable
        data={transfers}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search transfer #, material, project, vehicle..."
        exportExcel={{ filename: `inter-site-transfers-${projectId}` }}
        emptyState={{
          title: "No inter-site transfers recorded yet",
          description: "Move materials or equipment between site projects seamlessly.",
        }}
      />

      <InterSiteTransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        currentProjectId={projectId}
      />
    </div>
  );
}
