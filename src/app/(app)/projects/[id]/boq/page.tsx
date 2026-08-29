"use client";

import { use, useState, useRef, useMemo, useEffect, Suspense } from "react";
import { useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useFXStore } from "@/lib/fx-store";
import { Plus, Loader2, Download, Upload, Printer, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { AnimatedPage } from "@/components/ui/animated-page";
import { DocumentTrail } from "@/components/documents/document-trail";
import type { BoqItem } from "./types";
import { AnalysisLibraryTab } from "./components/analysis-library-tab";
import { AddBoqItemDialog } from "./components/add-boq-item-dialog";
import { exportBoq, importBoq } from "./utils";
import { GanttChart } from "../gantt/GanttChart";
import { RowActionBar } from "./components/row-action-bar";
import { FloatingActionBar } from "@/components/floating-action-bar";
import { ExcelPasteDialog } from "@/components/boq/excel-paste-dialog";
import { useParams, useSearchParams, usePathname } from "next/navigation";
import { BoqTabHeader } from "./components/boq-tab-header";
import { BoqFilterChips } from "./components/boq-filter-chips";
import { BoqTable } from "./components/boq-table";
import { RateAnalysisInspector } from "./components/rate-analysis-inspector";

export default function BoqPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <BoqPageContent params={params} />
    </Suspense>
  );
}

function BoqPageContent({
  params,
}: {
  params?: Promise<{ id: string }>;
}) {
  const routeParams = useParams();
  const id = (routeParams?.id as string) || "";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") || "boq";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showBaseline, setShowBaseline] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);
  const [excelPasteOpen, setExcelPasteOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [actionBarItem, setActionBarItem] = useState<{ item: BoqItem; el: HTMLElement } | null>(null);

  // Rate Analysis Inspector state
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.boq.list.useQuery({ projectId: id });

  const inspectedItem = useMemo(() => {
    if (!inspectedItemId || !data?.items) return null;
    return data.items.find((i) => i.id === inspectedItemId) || null;
  }, [data?.items, inspectedItemId]);

  const handleOpenAnalysis = (item: BoqItem) => {
    setInspectedItemId(item.id);
    setInspectorOpen(true);
  };

  const myRole = projectInfo?.myRole;
  const isLocked = !!projectInfo?.project?.boqLocked;
  const isAdmin = myRole === "project_manager" || myRole === "coordinator";
  const canWrite = !!(myRole && myRole !== "client" && myRole !== "inspector");
  const canWriteRateAnalysis = canWrite;
  const utils = trpc.useUtils() as any;
  const importInputRef = useRef<HTMLInputElement>(null);

  const lockBoqMutation = trpc.project.lockBoq.useMutation({
    onMutate: async ({ locked }) => {
      await utils.project.get.cancel({ id });
      const prevProject = utils.project.get.getData({ id }) as any;
      if (prevProject?.project) {
        utils.project.get.setData({ id }, {
          ...prevProject,
          project: { ...prevProject.project, boqLocked: locked },
        });
      }
      return { prevProject };
    },
    onSuccess: (data) => {
      toast.success(data.project.boqLocked ? "BOQ locked." : "BOQ unlocked.");
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prevProject) utils.project.get.setData({ id }, ctx.prevProject as any);
      toast.error(e.message);
    },
    onSettled: () => {
      utils.project.get.invalidate({ id });
      utils.boq.list.invalidate({ projectId: id });
    },
  });

  const lockItemMutation = trpc.boq.lockItem.useMutation({
    onMutate: async ({ itemId, locked }) => {
      await utils.boq.list.cancel({ projectId: id });
      const prev = utils.boq.list.getData({ projectId: id }) as { items: BoqItem[] } | undefined;
      if (prev) {
        utils.boq.list.setData({ projectId: id }, {
          ...prev,
          items: prev.items.map((i) =>
            i.id === itemId ? { ...i, locked } : i
          ),
        });
      }
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) utils.boq.list.setData({ projectId: id }, ctx.prev as any);
      toast.error(e.message);
    },
    onSettled: () => {
      utils.boq.list.invalidate({ projectId: id });
    },
  });

  const selSections = Array.from(
    new Set((data?.items ?? []).map((i) => i.section || i.category).filter((s): s is string => !!s))
  ).sort();

  const bulkMoveSectionMutation = useMutation({
    mutationFn: async ({ itemIds, section }: { itemIds: string[]; section: string | undefined }) => {
      await Promise.all(
        itemIds.map((itemId) =>
          utils.boq.update.mutateAsync({ itemId, section })
        )
      );
    },
    onSuccess: () => {
      utils.boq.list.invalidate({ projectId: id });
      toast.success(`${selectedItems.size} items moved`);
      setSelectedItems(new Set());
    },
    onError: () => toast.error("Failed to move items"),
  });

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const tableDensity = useFXStore((s) => s.tableDensity);
  const setTableDensity = useFXStore((s) => s.setTableDensity);

  const availableSections = useMemo(() => {
    if (!data?.items) return [];
    const secSet = new Set<string>();
    data.items.forEach((item) => {
      secSet.add(item.section || item.category || "Uncategorized");
    });
    return Array.from(secSet).sort();
  }, [data?.items]);

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter((item) => {
      const matchesSearch =
        !search ||
        item.code.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase()) ||
        (item.section ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (item.category ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (item.tags ?? "").toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;
      if (!activeCategoryFilter) return true;
      if (activeCategoryFilter === "__in_progress__") {
        return ((item as any).executedQty ?? 0) > 0;
      }
      const itemSec = item.section || item.category || "Uncategorized";
      return itemSec === activeCategoryFilter;
    });
  }, [data?.items, search, activeCategoryFilter]);

  const totalAmount = filtered?.reduce((s, i) => s + i.amount, 0) ?? 0;

  function toggleSection(section: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function toggleSelect(itemId: string) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleSelectAll() {
    const allIds = (filtered ?? []).map((i) => i.id);
    if (selectedItems.size === allIds.length && allIds.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(allIds));
    }
  }

  function toggleExpand(itemId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  // Keyboard traversal for BoQ items & inspector toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const items = filtered;
        if (!items.length) return;
        const currentIdx = items.findIndex((i) => i.id === inspectedItemId);
        const nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
        setInspectedItemId(items[nextIdx].id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const items = filtered;
        if (!items.length) return;
        const currentIdx = items.findIndex((i) => i.id === inspectedItemId);
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
        setInspectedItemId(items[prevIdx].id);
      } else if (e.key === " " && activeTab === "boq") {
        e.preventDefault();
        if (!inspectedItemId && filtered.length > 0) {
          setInspectedItemId(filtered[0].id);
          setInspectorOpen(true);
        } else {
          setInspectorOpen((prev) => !prev);
        }
      } else if (e.key === "Escape") {
        setInspectorOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filtered, inspectedItemId, activeTab]);

  return (
    <AnimatedPage className="space-y-4 pb-8">
      {myRole === "client" || myRole === "inspector" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          You have read-only access. BOQ items cannot be edited.
        </div>
      ) : null}

      <Tabs defaultValue={defaultTab} onValueChange={(v) => setActiveTab(v)}>
        <BoqTabHeader
          id={id}
          pathname={pathname}
          activeTab={activeTab}
          search={search}
          setSearch={setSearch}
          tableDensity={tableDensity}
          setTableDensity={setTableDensity}
          showBaseline={showBaseline}
          setShowBaseline={setShowBaseline}
          canWrite={canWrite}
          isLocked={isLocked}
          onExcelPasteOpen={() => setExcelPasteOpen(true)}
          isInspectorOpen={inspectorOpen}
          onToggleInspector={() => {
            if (!inspectorOpen && !inspectedItemId && filtered.length > 0) {
              setInspectedItemId(filtered[0].id);
            }
            setInspectorOpen((prev) => !prev);
          }}
        />

        <TabsContent value="boq" className="space-y-0 relative">
          <BoqFilterChips
            items={data?.items ?? []}
            availableSections={availableSections}
            activeCategoryFilter={activeCategoryFilter}
            setActiveCategoryFilter={setActiveCategoryFilter}
            selectedItems={selectedItems}
            clearSelection={() => setSelectedItems(new Set())}
            canWrite={canWrite}
            isLocked={isLocked}
            selSections={selSections}
            bulkMoveSectionMutation={bulkMoveSectionMutation}
          />

          <div className="flex gap-0 items-stretch relative rounded-lg border border-border/60 bg-slate-50 dark:bg-slate-950/30 h-[calc(100vh-140px)] overflow-hidden">
            <div className="flex-1 min-w-0 overflow-auto">
              <BoqTable
                projectId={id}
                filtered={filtered}
                canWrite={canWrite}
                isLocked={isLocked}
                tableDensity={tableDensity}
                showBaseline={showBaseline}
                selectedItems={selectedItems}
                toggleSelectAll={toggleSelectAll}
                toggleSelect={toggleSelect}
                expanded={expanded}
                toggleExpand={toggleExpand}
                collapsedSections={collapsedSections}
                toggleSection={toggleSection}
                actionBarItem={actionBarItem}
                setActionBarItem={setActionBarItem}
                totalAmount={totalAmount}
                inspectedItemId={inspectorOpen ? inspectedItemId : null}
                onOpenAnalysis={handleOpenAnalysis}
              />
            </div>

            {/* Rate Analysis Master-Detail Inspector Drawer */}
            {inspectorOpen && inspectedItem && (
              <RateAnalysisInspector
                item={inspectedItem}
                projectId={id}
                canWrite={canWriteRateAnalysis}
                onClose={() => setInspectorOpen(false)}
              />
            )}
          </div>

          {actionBarItem && (
            <RowActionBar
              item={actionBarItem.item}
              anchorEl={actionBarItem.el}
              onClose={() => setActionBarItem(null)}
              canWrite={canWrite}
              isLocked={isLocked}
              sections={selSections}
              onMoveSection={(section) => {
                bulkMoveSectionMutation.mutate({ itemIds: [actionBarItem.item.id], section });
                setActionBarItem(null);
              }}
              onToggleAnalysis={() => handleOpenAnalysis(actionBarItem.item)}
              onToggleLock={() => lockItemMutation.mutate({ itemId: actionBarItem.item.id, locked: !actionBarItem.item.locked })}
            />
          )}
        </TabsContent>

        <TabsContent value="schedule">
          <GanttChart projectId={id} view="schedule" />
        </TabsContent>

        <TabsContent value="resources">
          <GanttChart projectId={id} view="resources" />
        </TabsContent>

        <TabsContent value="scurve">
          <GanttChart projectId={id} view="scurve" />
        </TabsContent>
      </Tabs>

      {activeTab === "boq" && (
        <FloatingActionBar
          actions={[
            { icon: <Plus className="h-4 w-4" />, label: "Add item", onClick: () => setShowAddRow(true), disabled: !canWrite || isLocked },
            { icon: <Printer className="h-4 w-4" />, label: "Print", onClick: () => window.print(), disabled: !data?.items.length },
            { icon: <Download className="h-4 w-4" />, label: "Export to Excel", onClick: () => exportBoq(data?.items ?? [], id), disabled: !data?.items.length },
            { icon: <Upload className="h-4 w-4" />, label: "Import from Excel", onClick: () => importInputRef.current?.click(), disabled: !canWrite },
            { icon: lockBoqMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />, label: isLocked ? "Unlock BOQ" : "Lock BOQ", onClick: () => { if (confirm(isLocked ? "Unlock the BOQ? Items will be editable again." : "Lock the BOQ? Items will become read-only.")) { lockBoqMutation.mutate({ projectId: id, locked: !isLocked }); } }, disabled: !isAdmin || !data?.items?.length, destructive: !isLocked },
          ]}
        />
      )}

      <AddBoqItemDialog
        projectId={id}
        existingCount={data?.items.length ?? 0}
        existingSections={selSections}
        isLocked={isLocked}
        open={showAddRow}
        onOpenChange={setShowAddRow}
      />
      <ExcelPasteDialog
        projectId={id}
        open={excelPasteOpen}
        onOpenChange={setExcelPasteOpen}
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            importBoq(file, id, utils, () => {
              utils.boq.list.invalidate({ projectId: id });
              e.target.value = "";
            });
          }
        }}
      />

      <DocumentTrail
        projectId={id}
        entityType="boq"
        entityId={id}
        defaultSignedBy={projectInfo?.project?.client ?? undefined}
      />
    </AnimatedPage>
  );
}
