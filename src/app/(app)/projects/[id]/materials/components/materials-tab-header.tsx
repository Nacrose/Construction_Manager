"use client";

import {
  Package,
  FileSpreadsheet,
  ClipboardList,
  Building2,
  Truck,
  Receipt,
  Clock,
  ArrowUpDown,
  Scale,
  Zap,
  ChevronRight,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MaterialTabId =
  | "inventory"
  | "requisitions"
  | "pos"
  | "stores"
  | "gate"
  | "bills"
  | "lookahead"
  | "transactions"
  | "reconciliation";

export function MaterialsTabHeader({
  activeTab,
  setActiveTab,
  totalStockItems,
  pendingReqCount,
  activePOCount,
  pendingGateCount,
  unpaidBillsCount,
  canWrite,
  onOpenReceiveTxn,
  onOpenIssueTxn,
  onOpenAddGate,
  onOpenCreateReq,
  onOpenCreatePO,
  onOpenAddMaterial,
}: {
  activeTab: MaterialTabId;
  setActiveTab: (tab: MaterialTabId) => void;
  totalStockItems: number;
  pendingReqCount: number;
  activePOCount: number;
  pendingGateCount: number;
  unpaidBillsCount: number;
  canWrite: boolean;
  onOpenReceiveTxn: () => void;
  onOpenIssueTxn: () => void;
  onOpenAddGate: () => void;
  onOpenCreateReq: () => void;
  onOpenCreatePO: () => void;
  onOpenAddMaterial: () => void;
}) {
  const tabs = [
    { id: "inventory" as const, label: "Inventory", Icon: Package, badge: totalStockItems },
    {
      id: "requisitions" as const,
      label: "Requisitions",
      Icon: FileSpreadsheet,
      badge: pendingReqCount > 0 ? pendingReqCount : undefined,
      badgeColor: "bg-amber-500 text-white",
    },
    {
      id: "pos" as const,
      label: "Orders",
      Icon: ClipboardList,
      badge: activePOCount > 0 ? activePOCount : undefined,
      badgeColor: "bg-purple-500 text-white",
    },
    { id: "stores" as const, label: "Stores", Icon: Building2 },
    {
      id: "gate" as const,
      label: "Gate",
      Icon: Truck,
      badge: pendingGateCount > 0 ? pendingGateCount : undefined,
      badgeColor: "bg-amber-500 text-white",
    },
    {
      id: "bills" as const,
      label: "Bills",
      Icon: Receipt,
      badge: unpaidBillsCount > 0 ? unpaidBillsCount : undefined,
      badgeColor: "bg-rose-500 text-white",
    },
    { id: "lookahead" as const, label: "Lookahead", Icon: Clock },
    { id: "transactions" as const, label: "Ledger", Icon: ArrowUpDown },
    { id: "reconciliation" as const, label: "Reconcile", Icon: Scale },
  ];

  return (
    <div className="flex items-center justify-between gap-1.5 border-b border-border/80 pb-1.5 overflow-x-auto scrollbar-none flex-nowrap">
      {/* 1-Click Visible Tabs */}
      <div className="flex items-center gap-0.5 shrink-0 text-xs">
        {tabs.map(({ id: tabId, label, Icon, badge, badgeColor }) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setActiveTab(tabId)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md font-medium text-[11px] transition-all whitespace-nowrap shrink-0",
              activeTab === tabId
                ? "bg-foreground text-background shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            <Icon className="h-3 w-3" />
            <span>{label}</span>
            {badge !== undefined && (
              <span
                className={cn(
                  "inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[8.5px] font-bold",
                  badgeColor ||
                    (activeTab === tabId
                      ? "bg-background/20 text-background"
                      : "bg-muted text-muted-foreground")
                )}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Quick Action Dropdown */}
      {canWrite && (
        <div className="flex items-center gap-1.5 shrink-0 pl-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="h-6.5 px-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] shadow-xs gap-1 rounded-md shrink-0"
              >
                <Zap className="h-3 w-3" />
                + Action
                <ChevronRight className="h-2.5 w-2.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-1.5 rounded-xl shadow-xl">
              <DropdownMenuLabel className="text-[11px] text-muted-foreground font-semibold px-2 py-1">
                Stock & Procurement Actions
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={onOpenReceiveTxn}
                className="cursor-pointer gap-2 text-xs py-2 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium rounded-lg"
              >
                <Truck className="h-4 w-4 text-emerald-500" />
                <div>
                  <div className="font-semibold text-foreground">Log Material Delivery (दाखिला)</div>
                  <div className="text-[10px] text-muted-foreground">
                    1-Click site drop &amp; auto-stock update
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onOpenIssueTxn}
                className="cursor-pointer gap-2 text-xs py-2 text-amber-700 dark:text-amber-300 font-medium rounded-lg"
              >
                <Package className="h-4 w-4 text-amber-600" />
                <div>
                  <div className="font-semibold text-foreground">Issue Stock (Outward)</div>
                  <div className="text-[10px] text-muted-foreground">
                    Issue to subcontractor or task
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenAddGate} className="cursor-pointer gap-2 text-xs py-2">
                <Truck className="h-4 w-4 text-amber-500" />
                <div>
                  <div className="font-semibold">Log Inward Delivery</div>
                  <div className="text-[10px] text-muted-foreground">
                    Gate Pass & Weighbridge Calc
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onOpenCreateReq}
                className="cursor-pointer gap-2 text-xs py-2"
              >
                <FileSpreadsheet className="h-4 w-4 text-blue-500" />
                <div>
                  <div className="font-semibold">New Requisition (PR)</div>
                  <div className="text-[10px] text-muted-foreground">
                    3-Vendor Quotations Matrix
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onOpenCreatePO}
                className="cursor-pointer gap-2 text-xs py-2"
              >
                <ClipboardList className="h-4 w-4 text-violet-500" />
                <div>
                  <div className="font-semibold">Draft Purchase Order</div>
                  <div className="text-[10px] text-muted-foreground">
                    Issue PO with 13% VAT terms
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setActiveTab("stores")}
                className="cursor-pointer gap-2 text-xs py-2"
              >
                <Building2 className="h-4 w-4 text-emerald-500" />
                <div>
                  <div className="font-semibold">Inter-Store Transfer</div>
                  <div className="text-[10px] text-muted-foreground">Transfer between site stores</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setActiveTab("bills")}
                className="cursor-pointer gap-2 text-xs py-2"
              >
                <Receipt className="h-4 w-4 text-rose-500" />
                <div>
                  <div className="font-semibold">Register Vendor Bill</div>
                  <div className="text-[10px] text-muted-foreground">3-Way Match & TDS Payment</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onOpenAddMaterial}
                className="cursor-pointer gap-2 text-xs py-2"
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Add Project Material</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
