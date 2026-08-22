"use client";

import { use, useState } from "react";
import {
  Wrench,
  Fuel,
  CalendarClock,
  Truck,
  Building2,
  Zap,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
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
import { RentalsTab } from "@/components/equipment/rentals-tab";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { EquipmentFleetTab } from "./components/equipment-fleet-tab";
import { EquipmentLogsTab } from "./components/equipment-logs-tab";
import { EquipmentMaintenanceTab } from "./components/equipment-maintenance-tab";
import { EquipmentFuelTab } from "./components/equipment-fuel-tab";
import { EquipmentDialogs } from "./components/equipment-dialogs";
import { Equipment, EquipmentLog, Maintenance } from "./components/types";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

export default function EquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  // Dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [activeMaintId, setActiveMaintId] = useState<string | null>(null);

  // View state
  const [activeTab, setActiveTab] = useState<"fleet" | "logs" | "maintenance" | "fuel" | "rentals">(
    "fleet"
  );

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.equipment.list.useQuery({ projectId: id });
  const { data: logsData, isLoading: isLogsLoading } = trpc.equipment.listLogs.useQuery({
    projectId: id,
  });
  const { data: maintData, isLoading: isMaintLoading } = trpc.equipment.listMaintenance.useQuery({
    projectId: id,
  });
  const { data: efficiencyData } = trpc.equipment.getEfficiencyStats.useQuery({ projectId: id });
  const { data: rentalsData } = trpc.equipment.listRentals.useQuery({ projectId: id });
  const { data: taskStatsData, isLoading: isTaskStatsLoading } =
    trpc.equipment.getTaskEquipmentStats.useQuery({ projectId: id });

  const updateStatusMutation = trpc.equipment.updateStatus.useMutation({
    onSuccess: () => {
      utils.equipment.list.invalidate({ projectId: id });
      toast.success("Equipment status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.equipment.delete.useMutation({
    onSuccess: () => {
      utils.equipment.list.invalidate({ projectId: id });
      toast.success("Equipment deleted successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  const canWrite = Boolean(
    projectInfo?.myRole &&
      projectInfo.myRole !== "client" &&
      projectInfo.myRole !== "inspector"
  );

  const allEquipment = (data?.equipment || []) as Equipment[];
  const pendingMaintCount = (maintData?.maintenance || []).filter(
    (m) => m.status === "pending"
  ).length;
  const activeRentalsCount = (rentalsData?.rentals || []).filter(
    (r) => r.status === "active"
  ).length;

  const fuelReconciliation = allEquipment.map((e: any) => {
    const stat = efficiencyData?.stats.find((s) => s.equipmentId === e.id);
    const factoryFuelRate = stat?.factoryFuelRate || e.factoryFuelRate || 0;
    const currEfficiency = stat?.currEfficiency || 0;
    const variance =
      factoryFuelRate > 0 ? ((currEfficiency - factoryFuelRate) / factoryFuelRate) * 100 : 0;

    return {
      ...e,
      factoryFuelRate,
      histEfficiency: stat?.histEfficiency || 0,
      currEfficiency: stat?.currEfficiency || 0,
      isHighConsumption: stat?.isHighConsumption || false,
      isTheftWarning: variance > 5,
      variancePct: variance,
    };
  });

  const theftCount = fuelReconciliation.filter((f) => f.isTheftWarning).length;

  const tabs = [
    { id: "fleet" as const, label: "Fleet", Icon: Truck, badge: allEquipment.length },
    {
      id: "logs" as const,
      label: "Logbook & Activity",
      Icon: CalendarClock,
      badge: logsData?.logs.length,
    },
    {
      id: "maintenance" as const,
      label: "Maintenance",
      Icon: Wrench,
      badge: pendingMaintCount > 0 ? pendingMaintCount : undefined,
      badgeColor: "bg-amber-500 text-white",
    },
    {
      id: "fuel" as const,
      label: "Fuel Audit",
      Icon: Fuel,
      badge: theftCount > 0 ? `${theftCount} Alert` : undefined,
      badgeColor: "bg-rose-500 text-white",
    },
    {
      id: "rentals" as const,
      label: "Rentals",
      Icon: Building2,
      badge: activeRentalsCount > 0 ? activeRentalsCount : undefined,
    },
  ];

  return (
    <>
      <ModuleTabs projectId={id} tabs={RES_TABS} />
      <AnimatedPage>
        <div className="space-y-3 pb-8">
          {/* Single-Row Ultra-Compact Toolbar */}
          <div className="flex items-center justify-between gap-1.5 border-b border-border/50 pb-2 flex-nowrap overflow-x-hidden">
            {/* Micro Tabs */}
            <div className="flex items-center gap-1 flex-nowrap overflow-x-hidden">
              {tabs.map(({ id: tabId, label, Icon, badge, badgeColor }) => (
                <button
                  key={tabId}
                  onClick={() => setActiveTab(tabId)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all whitespace-nowrap shrink-0",
                    activeTab === tabId
                      ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span>{label}</span>
                  {badge !== undefined && (
                    <span
                      className={cn(
                        "px-1 py-0 text-[9px] rounded-full font-bold leading-tight ml-0.5",
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

            {/* + Action Dropdown Menu */}
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
                  <DropdownMenuContent align="end" className="w-60 p-1.5 rounded-xl shadow-xl">
                    <DropdownMenuLabel className="text-[11px] text-muted-foreground font-semibold px-2 py-1">
                      Fleet & Operations Actions
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => setLogOpen(true)}
                      className="cursor-pointer gap-2 text-xs py-2 bg-blue-500/5 hover:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium rounded-lg"
                    >
                      <CalendarClock className="h-4 w-4 text-blue-600" />
                      <div>
                        <div className="font-semibold text-foreground">
                          Log Run Hours & Activity
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Daily hour-meter, distance & output
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setMaintOpen(true)}
                      className="cursor-pointer gap-2 text-xs py-2 text-amber-700 dark:text-amber-300 font-medium rounded-lg"
                    >
                      <Wrench className="h-4 w-4 text-amber-600" />
                      <div>
                        <div className="font-semibold text-foreground">
                          Log Maintenance Ticket
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Breakdown or periodic service
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setAddOpen(true)}
                      className="cursor-pointer gap-2 text-xs py-2"
                    >
                      <Truck className="h-4 w-4 text-emerald-500" />
                      <div>
                        <div className="font-semibold">Register Equipment</div>
                        <div className="text-[10px] text-muted-foreground">
                          Add owned/project machinery
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setActiveTab("rentals")}
                      className="cursor-pointer gap-2 text-xs py-2"
                    >
                      <Building2 className="h-4 w-4 text-violet-500" />
                      <div>
                        <div className="font-semibold">New Rental Contract</div>
                        <div className="text-[10px] text-muted-foreground">
                          Hire machine from vendor
                        </div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* 1. FLEET TAB */}
          {activeTab === "fleet" && (
            <EquipmentFleetTab
              id={id}
              isLoading={isLoading}
              allEquipment={allEquipment}
              canWrite={canWrite}
              updateStatusMutation={updateStatusMutation}
              deleteMutation={deleteMutation}
            />
          )}

          {/* 2. LOGBOOK & ACTIVITY TAB */}
          {activeTab === "logs" && (
            <EquipmentLogsTab
              isLogsLoading={isLogsLoading}
              logs={(logsData?.logs || []) as EquipmentLog[]}
              isTaskStatsLoading={isTaskStatsLoading}
              taskStats={taskStatsData?.taskStats || []}
            />
          )}

          {/* 3. MAINTENANCE TAB */}
          {activeTab === "maintenance" && (
            <EquipmentMaintenanceTab
              isMaintLoading={isMaintLoading}
              maintenance={(maintData?.maintenance || []) as Maintenance[]}
              canWrite={canWrite}
              setActiveMaintId={setActiveMaintId}
              setResolveOpen={setResolveOpen}
            />
          )}

          {/* 4. FUEL AUDIT TAB */}
          {activeTab === "fuel" && (
            <EquipmentFuelTab
              fuelReconciliation={fuelReconciliation}
              theftCount={theftCount}
            />
          )}

          {/* 5. RENTALS TAB */}
          {activeTab === "rentals" && <RentalsTab projectId={id} />}

          {/* Dialogs and Modals */}
          <EquipmentDialogs
            id={id}
            allEquipment={allEquipment}
            addOpen={addOpen}
            setAddOpen={setAddOpen}
            logOpen={logOpen}
            setLogOpen={setLogOpen}
            maintOpen={maintOpen}
            setMaintOpen={setMaintOpen}
            resolveOpen={resolveOpen}
            setResolveOpen={setResolveOpen}
            activeMaintId={activeMaintId}
          />
        </div>
      </AnimatedPage>
    </>
  );
}
