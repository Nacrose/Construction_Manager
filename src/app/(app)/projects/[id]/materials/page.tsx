"use client";

import { use, useState, useMemo } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { AnimatedPage } from "@/components/ui/animated-page";
import { LowStockAlerts } from "@/components/inventory/low-stock-alerts";
import { ReconciliationReport } from "@/components/inventory/reconciliation-report";
import { ModuleTabs } from "@/components/module-tabs";
import { StoreLocationsTab } from "./components/store-locations-tab";
import { VendorBillsTab } from "./components/vendor-bills-tab";
import { ProcurementLookaheadWidget } from "@/components/inventory/procurement-lookahead-widget";
import {
  MaterialsTabHeader,
  type MaterialTabId,
} from "./components/materials-tab-header";
import {
  MaterialsInventoryTab,
  type Material,
} from "./components/materials-inventory-tab";
import { MaterialsRequisitionsTab } from "./components/materials-requisitions-tab";
import { MaterialsOrdersTab } from "./components/materials-orders-tab";
import { MaterialsGateTab, type GateEntry } from "./components/materials-gate-tab";
import { MaterialsTransactionsTab } from "./components/materials-transactions-tab";
import { MaterialsDialogs } from "./components/materials-dialogs";
import { LogDirectMaterialDialog } from "@/components/materials/log-direct-material-dialog";
import { InterSiteTransfersTab } from "./components/inter-site-transfers-tab";
import { InterSiteTransferDialog } from "@/components/inventory/inter-site-transfer-dialog";
import { QuickBuyDialog } from "@/components/inventory/quick-buy-dialog";


export default function MaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState<MaterialTabId>("inventory");

  // Dialog States
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [addGateOpen, setAddGateOpen] = useState(false);
  const [createReqOpen, setCreateReqOpen] = useState(false);
  const [createPOOpen, setCreatePOOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [directDeliveryOpen, setDirectDeliveryOpen] = useState(false);
  const [quickBuyOpen, setQuickBuyOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedPoForPrint, setSelectedPoForPrint] = useState<any | null>(null);
  const [poPrintOpen, setPoPrintOpen] = useState(false);

  const [txnDefaultMaterial, setTxnDefaultMaterial] = useState<string>("");
  const [txnDefaultType, setTxnDefaultType] = useState<"receive" | "issue">("receive");
  const [txnDefaultGateId, setTxnDefaultGateId] = useState<string>("");
  const [reqStatusFilter, setReqStatusFilter] = useState<string>("all");
  const [selectedRequisitionId, setSelectedRequisitionId] = useState<string | null>(null);

  // Bulk selection state
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[]>([]);
  const [stockFilter, setStockFilter] = useState<
    "all" | "in_stock" | "low_stock" | "zero_stock"
  >("in_stock");

  // Queries
  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.material.list.useQuery({ projectId: id });
  const { data: txnsData, isLoading: isTxnsLoading } =
    trpc.material.listTransactions.useQuery({ projectId: id });
  const { data: gateData, isLoading: isGateLoading } =
    trpc.material.listGateEntries.useQuery({ projectId: id });
  const { data: subsData } = trpc.partner.listSubcontractors.useQuery({ projectId: id });
  const { data: reqsData, isLoading: isReqsLoading } = trpc.requisition.list.useQuery({
    projectId: id,
  });
  const { data: billsData } = trpc.vendorBill.list.useQuery({ projectId: id });

  const updatePOStatusMutation = trpc.purchaseOrder.updateStatus.useMutation({
    onSuccess: () => {
      utils.material.list.invalidate({ projectId: id });
      utils.material.listTransactions.invalidate({ projectId: id });
      toast.success("Purchase Order status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const canWrite = Boolean(
    projectInfo?.myRole &&
      projectInfo.myRole !== "client" &&
      projectInfo.myRole !== "inspector"
  );
  const isAdmin =
    projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "coordinator";

  const openQuickTxn = (materialId: string, type: "receive" | "issue") => {
    setTxnDefaultMaterial(materialId);
    setTxnDefaultType(type);
    setTxnDefaultGateId("");
    setTxnOpen(true);
  };

  const openGateVerification = (gate: GateEntry) => {
    setTxnDefaultGateId(gate.id);
    setTxnDefaultType("receive");
    setTxnDefaultMaterial("");
    setTxnOpen(true);
  };

  const deleteManyProjectMut = trpc.material.deleteMany.useMutation({
    onSuccess: (res) => {
      setSelectedMaterialIds(new Set());
      setDeleteConfirmIds([]);
      utils.material.list.invalidate({ projectId: id });
      toast.success(`Successfully deleted ${res.count} materials`);
    },
    onError: (e) => toast.error(e.message),
  });

  // Micro KPI counts
  const totalStockItems = data?.materials?.length ?? 0;
  const inStockCount = useMemo(
    () => data?.materials?.filter((m) => m.currentStock > 0).length ?? 0,
    [data?.materials]
  );
  const lowStockCount = useMemo(
    () =>
      data?.materials?.filter(
        (m) =>
          (m.currentStock > 0 && m.currentStock <= m.reorderLevel) ||
          (m.currentStock <= m.minStock && m.minStock > 0)
      ).length ?? 0,
    [data?.materials]
  );
  const zeroStockCount = useMemo(
    () => data?.materials?.filter((m) => m.currentStock === 0).length ?? 0,
    [data?.materials]
  );

  const filteredMaterials = useMemo(() => {
    if (!data?.materials) return [];
    if (stockFilter === "in_stock") return data.materials.filter((m) => m.currentStock > 0);
    if (stockFilter === "low_stock")
      return data.materials.filter(
        (m) =>
          (m.currentStock > 0 && m.currentStock <= m.reorderLevel) ||
          (m.currentStock <= m.minStock && m.minStock > 0)
      );
    if (stockFilter === "zero_stock") return data.materials.filter((m) => m.currentStock === 0);
    return data.materials;
  }, [data?.materials, stockFilter]);

  const pendingGateCount =
    gateData?.gateEntries?.filter((g) => g.status === "pending").length ?? 0;
  const pendingReqCount =
    reqsData?.requisitions?.filter(
      (r) => r.status === "pending_approval" || r.status === "submitted"
    ).length ?? 0;
  const activePOCount =
    data?.purchaseOrders?.filter(
      (p) => p.status === "issued" || p.status === "partially_received"
    ).length ?? 0;
  const unpaidBillsCount =
    billsData?.bills?.filter((b) => b.status === "pending" || b.status === "partial").length ?? 0;

  return (
    <>
      <ModuleTabs projectId={id} cluster="resources" />
      <AnimatedPage>
        <div className="space-y-2.5 pb-12">
          {/* Top Tabs Bar */}
          <MaterialsTabHeader
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            totalStockItems={totalStockItems}
            pendingReqCount={pendingReqCount}
            activePOCount={activePOCount}
            pendingGateCount={pendingGateCount}
            unpaidBillsCount={unpaidBillsCount}
            canWrite={canWrite}
            onOpenReceiveTxn={() => setDirectDeliveryOpen(true)}
            onOpenIssueTxn={() => {
              setTxnDefaultMaterial("");
              setTxnDefaultType("issue");
              setTxnDefaultGateId("");
              setTxnOpen(true);
            }}
            onOpenAddGate={() => setAddGateOpen(true)}
            onOpenCreateReq={() => setCreateReqOpen(true)}
            onOpenCreatePO={() => setCreatePOOpen(true)}
            onOpenAddMaterial={() => setAddMaterialOpen(true)}
            onOpenQuickBuy={() => setQuickBuyOpen(true)}
            onOpenTransfer={() => setTransferOpen(true)}
          />

          <LogDirectMaterialDialog
            open={directDeliveryOpen}
            onOpenChange={setDirectDeliveryOpen}
            defaultProjectId={id}
            onSuccess={() => utils.material.invalidate()}
          />

          <InterSiteTransferDialog
            open={transferOpen}
            onOpenChange={setTransferOpen}
            currentProjectId={id}
          />

          <QuickBuyDialog
            open={quickBuyOpen}
            onOpenChange={setQuickBuyOpen}
            projectId={id}
          />

          {/* 1. INVENTORY DIRECTORY */}
          {activeTab === "inventory" && (
            <MaterialsInventoryTab
              id={id}
              isLoading={isLoading}
              data={data}
              filteredMaterials={filteredMaterials as Material[]}
              stockFilter={stockFilter}
              setStockFilter={setStockFilter}
              inStockCount={inStockCount}
              lowStockCount={lowStockCount}
              zeroStockCount={zeroStockCount}
              totalStockItems={totalStockItems}
              selectedMaterialIds={selectedMaterialIds}
              setSelectedMaterialIds={setSelectedMaterialIds}
              setDeleteConfirmIds={setDeleteConfirmIds}
              canWrite={canWrite}
              openQuickTxn={openQuickTxn}
            />
          )}

          {/* 1.5 INTER-SITE TRANSFERS */}
          {activeTab === "transfers" && (
            <InterSiteTransfersTab projectId={id} canWrite={canWrite} />
          )}

          {/* 2. REQUISITIONS */}
          {activeTab === "requisitions" && (
            <MaterialsRequisitionsTab
              projectId={id}
              canWrite={canWrite}
              isAdmin={isAdmin}
              isReqsLoading={isReqsLoading}
              reqsData={reqsData}
              reqStatusFilter={reqStatusFilter}
              setReqStatusFilter={setReqStatusFilter}
              selectedRequisitionId={selectedRequisitionId}
              setSelectedRequisitionId={setSelectedRequisitionId}
              setCreateReqOpen={setCreateReqOpen}
            />
          )}

          {/* 3. PURCHASE ORDERS */}
          {activeTab === "pos" && (
            <MaterialsOrdersTab
              data={data}
              isLoading={isLoading}
              canWrite={canWrite}
              setCreatePOOpen={setCreatePOOpen}
              setSelectedPoForPrint={setSelectedPoForPrint}
              setPoPrintOpen={setPoPrintOpen}
              project={projectInfo?.project}
              projectId={id}
              updatePOStatusMutation={updatePOStatusMutation}
            />
          )}

          {/* 4. SITE STORES & TRANSFERS */}
          {activeTab === "stores" && <StoreLocationsTab projectId={id} />}

          {/* 5. GATE LOGISTICS & WEIGHBRIDGE */}
          {activeTab === "gate" && (
            <MaterialsGateTab
              canWrite={canWrite}
              isGateLoading={isGateLoading}
              gateData={gateData}
              setAddGateOpen={setAddGateOpen}
              openGateVerification={openGateVerification}
            />
          )}

          {/* 6. TRANSACTIONS LEDGER */}
          {activeTab === "transactions" && (
            <MaterialsTransactionsTab
              isTxnsLoading={isTxnsLoading}
              transactions={(txnsData?.transactions || []) as any}
            />
          )}

          {/* 7. 3-WAY MATCH & VENDOR BILLS */}
          {activeTab === "bills" && <VendorBillsTab projectId={id} />}

          {/* 8. LOOKAHEAD DEMAND */}
          {activeTab === "lookahead" && (
            <div className="space-y-4">
              <ProcurementLookaheadWidget projectId={id} />
              <LowStockAlerts projectId={id} />
            </div>
          )}

          {/* 9. RECONCILIATION */}
          {activeTab === "reconciliation" && (
            <div className="space-y-4">
              <ReconciliationReport projectId={id} />
            </div>
          )}
        </div>

        {/* Dialogs and Modals */}
        <MaterialsDialogs
          id={id}
          data={data}
          gateData={gateData}
          subsData={subsData}
          addMaterialOpen={addMaterialOpen}
          setAddMaterialOpen={setAddMaterialOpen}
          addGateOpen={addGateOpen}
          setAddGateOpen={setAddGateOpen}
          createReqOpen={createReqOpen}
          setCreateReqOpen={setCreateReqOpen}
          createPOOpen={createPOOpen}
          setCreatePOOpen={setCreatePOOpen}
          txnOpen={txnOpen}
          setTxnOpen={setTxnOpen}
          txnDefaultMaterial={txnDefaultMaterial}
          txnDefaultType={txnDefaultType}
          txnDefaultGateId={txnDefaultGateId}
          selectedPoForPrint={selectedPoForPrint}
          setSelectedPoForPrint={setSelectedPoForPrint}
          poPrintOpen={poPrintOpen}
          setPoPrintOpen={setPoPrintOpen}
          deleteConfirmIds={deleteConfirmIds}
          setDeleteConfirmIds={setDeleteConfirmIds}
          deleteManyProjectMut={deleteManyProjectMut}
        />
      </AnimatedPage>
    </>
  );
}
