"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Truck, Layers, Factory, Gauge } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { ModuleTabs } from "@/components/module-tabs";
import { AnimatedPage } from "@/components/ui/animated-page";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RES_TABS } from "./components/types";
import { ProductionDashboardTab } from "./components/ProductionDashboardTab";
import { DispatchTicketsTab } from "./components/DispatchTicketsTab";
import { MixDesignsTab } from "./components/MixDesignsTab";
import { PlantsManagementTab } from "./components/PlantsManagementTab";
import { ProductionDialogs } from "./components/ProductionDialogs";

export default function PlantProductionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  const [activeSubTab, setActiveSubTab] = useState("tickets");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketPlantFilter, setTicketPlantFilter] = useState("all");
  const [ticketStatusFilter, setTicketStatusFilter] = useState("all");

  // Queries
  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data: summaryData, isLoading: summaryLoading } =
    trpc.plantProduction.getProductionSummary.useQuery({ projectId: id });
  const { data: plantsData } = trpc.plantProduction.listPlants.useQuery({ projectId: id });
  const { data: mixDesignsData } = trpc.plantProduction.listMixDesigns.useQuery({ projectId: id });
  const { data: ticketsData, isLoading: ticketsLoading } =
    trpc.plantProduction.listBatchTickets.useQuery({
      projectId: id,
      plantId: ticketPlantFilter !== "all" ? ticketPlantFilter : undefined,
      status: ticketStatusFilter !== "all" ? ticketStatusFilter : undefined,
      q: ticketSearch || undefined,
    });

  const plants = plantsData?.plants || [];
  const mixDesigns = mixDesignsData?.mixDesigns || [];
  const tickets = ticketsData?.tickets || [];

  const myRole = projectInfo?.myRole;
  const canWrite = myRole && myRole !== "client" && myRole !== "inspector";

  // Modals state
  const [addPlantOpen, setAddPlantOpen] = useState(false);
  const [addTicketOpen, setAddTicketOpen] = useState(false);
  const [addMixOpen, setAddMixOpen] = useState(false);
  const [printTicket, setPrintTicket] = useState<any | null>(null);
  const [deleteTicketTarget, setDeleteTicketTarget] = useState<any | null>(null);
  const [editSiloTarget, setEditSiloTarget] = useState<any | null>(null);

  // Calculator State
  const [calcMixId, setCalcMixId] = useState<string>("");
  const [calcBatchVolume, setCalcBatchVolume] = useState<number>(6.0);

  // Mutations
  const createPlantMutation = trpc.plantProduction.createPlant.useMutation({
    onSuccess: () => {
      utils.plantProduction.listPlants.invalidate({ projectId: id });
      utils.plantProduction.getProductionSummary.invalidate({ projectId: id });
      toast.success("Plant created with default silos");
      setAddPlantOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const createTicketMutation = trpc.plantProduction.createBatchTicket.useMutation({
    onSuccess: (data) => {
      utils.plantProduction.listBatchTickets.invalidate({ projectId: id });
      utils.plantProduction.listPlants.invalidate({ projectId: id });
      utils.plantProduction.getProductionSummary.invalidate({ projectId: id });
      toast.success(`Batch Ticket ${data?.ticket?.ticketNumber} dispatched!`);
      setAddTicketOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTicketStatusMutation = trpc.plantProduction.updateBatchTicket.useMutation({
    onSuccess: () => {
      utils.plantProduction.listBatchTickets.invalidate({ projectId: id });
      utils.plantProduction.getProductionSummary.invalidate({ projectId: id });
      toast.success("Ticket status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTicketMutation = trpc.plantProduction.deleteBatchTicket.useMutation({
    onSuccess: () => {
      utils.plantProduction.listBatchTickets.invalidate({ projectId: id });
      utils.plantProduction.getProductionSummary.invalidate({ projectId: id });
      toast.success("Ticket deleted");
      setDeleteTicketTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const createMixMutation = trpc.plantProduction.createMixDesign.useMutation({
    onSuccess: () => {
      utils.plantProduction.listMixDesigns.invalidate({ projectId: id });
      toast.success("Mix Design created");
      setAddMixOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateSiloMutation = trpc.plantProduction.updateSiloStock.useMutation({
    onSuccess: () => {
      utils.plantProduction.listPlants.invalidate({ projectId: id });
      utils.plantProduction.getProductionSummary.invalidate({ projectId: id });
      toast.success("Silo stock updated");
      setEditSiloTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedCalcMix = useMemo(() => {
    return mixDesigns.find((m) => m.id === calcMixId) || mixDesigns[0];
  }, [mixDesigns, calcMixId]);

  return (
    <AnimatedPage className="space-y-4 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/projects/${id}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Back to project"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <Link
              href={`/projects/${id}`}
              className="text-muted-foreground hover:text-foreground truncate"
            >
              {projectInfo?.project.code ?? "Project"}
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-muted-foreground">Resources</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="font-semibold text-foreground">Plant & Production</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setAddTicketOpen(true)}
              >
                <Truck className="h-3.5 w-3.5" />
                New Dispatch Ticket
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setAddMixOpen(true)}
              >
                <Layers className="h-3.5 w-3.5" />
                New Mix Recipe
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setAddPlantOpen(true)}
              >
                <Factory className="h-3.5 w-3.5" />
                Add Plant
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Module navigation tabs */}
      <ModuleTabs projectId={id} tabs={RES_TABS} />

      {/* Main Tabs */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-fit bg-muted/60 p-1">
          <TabsTrigger value="dashboard" className="text-xs gap-1.5">
            <Gauge className="h-3.5 w-3.5" /> Live Operations
          </TabsTrigger>
          <TabsTrigger value="tickets" className="text-xs gap-1.5">
            <Truck className="h-3.5 w-3.5" /> Dispatch Chalan ({tickets.length})
          </TabsTrigger>
          <TabsTrigger value="mixes" className="text-xs gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Mix Designs ({mixDesigns.length})
          </TabsTrigger>
          <TabsTrigger value="plants" className="text-xs gap-1.5">
            <Factory className="h-3.5 w-3.5" /> Plants & Silos ({plants.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OPERATIONS DASHBOARD */}
        <TabsContent value="dashboard" className="space-y-4">
          <ProductionDashboardTab
            summaryLoading={summaryLoading}
            summaryData={summaryData}
            plants={plants}
            canWrite={Boolean(canWrite)}
            setEditSiloTarget={setEditSiloTarget}
            mixDesigns={mixDesigns}
            calcMixId={calcMixId}
            setCalcMixId={setCalcMixId}
            selectedCalcMix={selectedCalcMix}
            calcBatchVolume={calcBatchVolume}
            setCalcBatchVolume={setCalcBatchVolume}
          />
        </TabsContent>

        {/* TAB 2: BATCH & DISPATCH TICKETS */}
        <TabsContent value="tickets" className="space-y-3">
          <DispatchTicketsTab
            tickets={tickets}
            ticketsLoading={ticketsLoading}
            ticketSearch={ticketSearch}
            setTicketSearch={setTicketSearch}
            ticketPlantFilter={ticketPlantFilter}
            setTicketPlantFilter={setTicketPlantFilter}
            ticketStatusFilter={ticketStatusFilter}
            setTicketStatusFilter={setTicketStatusFilter}
            plants={plants}
            canWrite={Boolean(canWrite)}
            setPrintTicket={setPrintTicket}
            updateTicketStatusMutation={updateTicketStatusMutation}
            setDeleteTicketTarget={setDeleteTicketTarget}
          />
        </TabsContent>

        {/* TAB 3: MIX DESIGN LIBRARY */}
        <TabsContent value="mixes" className="space-y-4">
          <MixDesignsTab mixDesigns={mixDesigns} />
        </TabsContent>

        {/* TAB 4: PLANTS & SILOS */}
        <TabsContent value="plants" className="space-y-4">
          <PlantsManagementTab
            plants={plants}
            canWrite={Boolean(canWrite)}
            setEditSiloTarget={setEditSiloTarget}
          />
        </TabsContent>
      </Tabs>

      {/* Modals & Dialogs */}
      <ProductionDialogs
        id={id}
        projectName={projectInfo?.project?.name}
        plants={plants}
        mixDesigns={mixDesigns}
        addTicketOpen={addTicketOpen}
        setAddTicketOpen={setAddTicketOpen}
        createTicketMutation={createTicketMutation}
        addMixOpen={addMixOpen}
        setAddMixOpen={setAddMixOpen}
        createMixMutation={createMixMutation}
        addPlantOpen={addPlantOpen}
        setAddPlantOpen={setAddPlantOpen}
        createPlantMutation={createPlantMutation}
        editSiloTarget={editSiloTarget}
        setEditSiloTarget={setEditSiloTarget}
        updateSiloMutation={updateSiloMutation}
        printTicket={printTicket}
        setPrintTicket={setPrintTicket}
        deleteTicketTarget={deleteTicketTarget}
        setDeleteTicketTarget={setDeleteTicketTarget}
        deleteTicketMutation={deleteTicketMutation}
      />
    </AnimatedPage>
  );
}
