"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  type ReportLayout,
  type Cell,
  type CellType,
  type CellStyle,
  getPageSize,
  getContentArea,
  genCellId,
  starterLayoutDailyReport,
  starterLayoutSchedule,
} from "@/lib/report-tokens";
import { ReportRenderer } from "./report-renderer";
import { useHistorizedState } from "./use-historized-state";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  Save,
  Eye,
  FileText,
  FolderOpen,
  Undo2,
  Redo2,
  HelpCircle,
  Layout,
} from "lucide-react";
import { toast } from "sonner";
import { CellOverlay } from "./cell-overlay";
import { DesignerSidebar } from "./designer-sidebar";
import { PropertiesPanel, MultiSelectPanel, PageSettingsPanel } from "./properties-panel";
import {
  SaveTemplateDialog,
  LoadTemplateDialog,
  PreviewModal,
  HelpDialog,
  StarterGalleryDialog,
  ContextMenu,
} from "./designer-dialogs";

const MM_TO_PX = 3.7795;
const SNAP_MM = 1;

type Props = {
  entityType: string;
  entityId: string;
  projectId: string;
  data: any;
  backHref: string;
};

export function ReportDesigner({ entityType, entityId, projectId, data, backHref }: Props) {
  const utils = trpc.useUtils();
  const initialLayout = useMemo(() => {
    return entityType === "schedule" ? starterLayoutSchedule() : starterLayoutDailyReport();
  }, [entityType]);

  const {
    state: layout,
    setState: setLayout,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetLayout,
  } = useHistorizedState<ReportLayout>(initialLayout, { debounceMs: 400, maxHistory: 50 });

  const [selectedCellIds, setSelectedCellIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(0.6);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [loadTplOpen, setLoadTplOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    cellId: string;
  } | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplScope, setTplScope] = useState<"global" | "project" | "user">("user");
  const [tokenSearch, setTokenSearch] = useState("");

  // Persist in-progress layout to localStorage
  useEffect(() => {
    const key = `pdf-designer-layout-${entityType}-${entityId}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.cells && parsed?.page) resetLayout(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [entityType, entityId, resetLayout]);

  useEffect(() => {
    const key = `pdf-designer-layout-${entityType}-${entityId}`;
    try {
      localStorage.setItem(key, JSON.stringify(layout));
    } catch {
      /* ignore quota */
    }
  }, [layout, entityType, entityId]);

  // Templates list
  const { data: tplData, isLoading: tplLoading } = trpc.reportTemplate.list.useQuery({
    entityType,
    projectId,
  });
  const templates = tplData?.templates ?? [];

  const createTplMut = trpc.reportTemplate.create.useMutation({
    onSuccess: () => {
      utils.reportTemplate.list.invalidate({ entityType, projectId });
      toast.success("Template saved");
      setSaveTplOpen(false);
      setTplName("");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTplMut = trpc.reportTemplate.delete.useMutation({
    onSuccess: () => {
      utils.reportTemplate.list.invalidate({ entityType, projectId });
      toast.success("Template deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedCellId = selectedCellIds.size === 1 ? Array.from(selectedCellIds)[0] : null;
  const selectedCell = layout.cells.find((c) => c.id === selectedCellId) || null;

  const selectCell = useCallback((id: string, shiftKey: boolean) => {
    setSelectedCellIds((prev) => {
      if (shiftKey) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return new Set([id]);
    });
    setEditingCellId(null);
  }, []);

  const selectNone = useCallback(() => {
    setSelectedCellIds(new Set());
    setEditingCellId(null);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedCellIds(new Set(layout.cells.map((c) => c.id)));
  }, [layout.cells]);

  const updateSelectedCellsStyle = useCallback(
    (patch: Partial<CellStyle>) => {
      setLayout((prev) => ({
        ...prev,
        cells: prev.cells.map((c) =>
          selectedCellIds.has(c.id) ? { ...c, style: { ...c.style, ...patch } } : c
        ),
      }));
    },
    [selectedCellIds, setLayout]
  );

  const deleteSelectedCells = useCallback(() => {
    setLayout((prev) => ({
      ...prev,
      cells: prev.cells.filter((c) => !selectedCellIds.has(c.id)),
    }));
    setSelectedCellIds(new Set());
  }, [selectedCellIds, setLayout]);

  const duplicateSelectedCells = useCallback(() => {
    const toDup = layout.cells.filter((c) => selectedCellIds.has(c.id));
    const newCells = toDup.map((c) => ({
      ...c,
      id: genCellId(),
      x: c.x + 4,
      y: c.y + 4,
      content: { ...c.content } as any,
      style: { ...c.style },
    }));
    setLayout((prev) => ({ ...prev, cells: [...prev.cells, ...newCells] }));
    setSelectedCellIds(new Set(newCells.map((c) => c.id)));
  }, [layout.cells, selectedCellIds, setLayout]);

  const bringToFront = useCallback(
    (ids: string[]) => {
      const maxZ = Math.max(0, ...layout.cells.map((c) => c.zIndex ?? 0));
      setLayout((prev) => ({
        ...prev,
        cells: prev.cells.map((c) => (ids.includes(c.id) ? { ...c, zIndex: maxZ + 1 } : c)),
      }));
    },
    [layout.cells, setLayout]
  );

  const sendToBack = useCallback(
    (ids: string[]) => {
      const minZ = Math.min(0, ...layout.cells.map((c) => c.zIndex ?? 0));
      setLayout((prev) => ({
        ...prev,
        cells: prev.cells.map((c) => (ids.includes(c.id) ? { ...c, zIndex: minZ - 1 } : c)),
      }));
    },
    [layout.cells, setLayout]
  );

  const toggleLock = useCallback(
    (ids: string[]) => {
      setLayout((prev) => ({
        ...prev,
        cells: prev.cells.map((c) => (ids.includes(c.id) ? { ...c, locked: !c.locked } : c)),
      }));
    },
    [setLayout]
  );

  const updateCell = useCallback(
    (id: string, patch: Partial<Cell>) => {
      setLayout((prev) => ({
        ...prev,
        cells: prev.cells.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    },
    [setLayout]
  );

  const updateCellStyle = useCallback(
    (id: string, patch: Partial<CellStyle>) => {
      setLayout((prev) => ({
        ...prev,
        cells: prev.cells.map((c) => (c.id === id ? { ...c, style: { ...c.style, ...patch } } : c)),
      }));
    },
    [setLayout]
  );

  const updateCellContent = useCallback(
    (id: string, patch: any) => {
      setLayout((prev) => ({
        ...prev,
        cells: prev.cells.map((c) =>
          c.id === id ? { ...c, content: { ...c.content, ...patch } } : c
        ),
      }));
    },
    [setLayout]
  );

  const addCell = useCallback(
    (type: CellType, pos?: { x: number; y: number }) => {
      const contentArea = getContentArea(layout.page);
      const offset = layout.cells.length * 2;
      const defaultW =
        type === "table" ? 180 : type === "kpi" ? 40 : type === "signature" ? 55 : type === "divider" ? 180 : 100;
      const defaultH =
        type === "table" ? 40 : type === "kpi" ? 22 : type === "signature" ? 30 : type === "divider" ? 1 : 16;

      let content: any;
      switch (type) {
        case "text":
          content = { type: "text", text: "New text — {{report.number}}" };
          break;
        case "table":
          content = {
            type: "table",
            entity: "workforce",
            columns: ["company", "trade", "skill", "headcount", "regHours", "otHours", "location"],
            showHeader: true,
            zebra: true,
          };
          break;
        case "kpi":
          content = {
            type: "kpi",
            metric: "workforce.total_headcount",
            label: "Workforce",
            format: "number",
          };
          break;
        case "image":
          content = { type: "image", src: "", alt: "", fit: "contain" };
          break;
        case "divider":
          content = { type: "divider", orientation: "horizontal", thickness: 1 };
          break;
        case "signature":
          content = { type: "signature", role: "prepared" };
          break;
      }
      const newCell: Cell = {
        id: genCellId(),
        type,
        x: Math.round((pos?.x ?? contentArea.x + offset) / SNAP_MM) * SNAP_MM,
        y: Math.round((pos?.y ?? contentArea.y + offset) / SNAP_MM) * SNAP_MM,
        w: defaultW,
        h: defaultH,
        content: content as any,
        style: {
          fontSize: type === "text" ? 10 : type === "table" ? 8 : undefined,
          align: type === "kpi" || type === "signature" ? "center" : "left",
          valign: type === "kpi" || type === "signature" ? "middle" : "top",
          border: type === "kpi" || type === "signature" ? "all" : undefined,
          borderColor: "#d1d5db",
          borderWidth: 1,
          padding: 2,
        },
      };
      setLayout((prev) => ({ ...prev, cells: [...prev.cells, newCell] }));
      setSelectedCellIds(new Set([newCell.id]));
    },
    [layout.page, layout.cells.length, setLayout]
  );

  const deleteCell = useCallback(
    (id: string) => {
      setLayout((prev) => ({ ...prev, cells: prev.cells.filter((c) => c.id !== id) }));
      setSelectedCellIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    },
    [setLayout]
  );

  const duplicateCell = useCallback(
    (id: string) => {
      const cell = layout.cells.find((c) => c.id === id);
      if (!cell) return;
      const newCell: Cell = {
        ...cell,
        id: genCellId(),
        x: cell.x + 4,
        y: cell.y + 4,
        content: { ...cell.content } as any,
        style: { ...cell.style },
        locked: false,
      };
      setLayout((prev) => ({ ...prev, cells: [...prev.cells, newCell] }));
      setSelectedCellIds(new Set([newCell.id]));
    },
    [layout.cells, setLayout]
  );

  const updatePage = useCallback(
    (patch: Partial<ReportLayout["page"]>) => {
      setLayout((prev) => ({ ...prev, page: { ...prev.page, ...patch } }));
    },
    [setLayout]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        if (e.key === "Escape" && editingCellId) {
          setEditingCellId(null);
          (target as HTMLElement).blur();
        }
        return;
      }

      const cmd = e.ctrlKey || e.metaKey;

      if (cmd && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (
        (cmd && e.key.toLowerCase() === "z" && e.shiftKey) ||
        (cmd && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "?" && !cmd) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (cmd && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
        return;
      }
      if (e.key === "Escape") {
        if (editingCellId) {
          setEditingCellId(null);
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        selectNone();
        return;
      }

      if (selectedCellIds.size === 0) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const toDelete = Array.from(selectedCellIds).filter((id) => {
          const c = layout.cells.find((cell) => cell.id === id);
          return c && !c.locked;
        });
        if (toDelete.length === 0) {
          toast.info("Cell is locked — unlock it first");
          return;
        }
        toDelete.forEach((id) => deleteCell(id));
        return;
      }
      if (cmd && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelectedCells();
        return;
      }
      if (e.key === "Enter" && selectedCellIds.size === 1) {
        const cell = layout.cells.find((c) => c.id === selectedCellId);
        if (cell && cell.type === "text" && !cell.locked) {
          e.preventDefault();
          setEditingCellId(cell.id);
          return;
        }
      }
      const nudge = e.shiftKey ? 5 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -nudge;
      else if (e.key === "ArrowRight") dx = nudge;
      else if (e.key === "ArrowUp") dy = -nudge;
      else if (e.key === "ArrowDown") dy = nudge;
      else return;
      e.preventDefault();
      selectedCellIds.forEach((id) => {
        const cell = layout.cells.find((c) => c.id === id);
        if (!cell || cell.locked) return;
        updateCell(id, {
          x: Math.max(0, cell.x + dx),
          y: Math.max(0, cell.y + dy),
        });
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    selectedCellIds,
    selectedCellId,
    layout.cells,
    undo,
    redo,
    deleteCell,
    duplicateSelectedCells,
    selectAll,
    selectNone,
    updateCell,
    editingCellId,
    contextMenu,
  ]);

  const handleSaveTemplate = () => {
    if (!tplName.trim()) {
      toast.error("Enter a template name");
      return;
    }
    createTplMut.mutate({
      name: tplName.trim(),
      entityType,
      scope: tplScope,
      projectId: tplScope === "project" ? projectId : undefined,
      layout: JSON.stringify(layout),
      isDefault: false,
    });
  };

  const handleLoadTemplate = (tpl: any) => {
    try {
      const parsed = typeof tpl.layout === "string" ? JSON.parse(tpl.layout) : tpl.layout;
      if (parsed?.cells && parsed?.page) {
        resetLayout(parsed);
        setLoadTplOpen(false);
        toast.success(`Loaded template "${tpl.name}"`);
      } else {
        toast.error("Invalid template format");
      }
    } catch {
      toast.error("Failed to parse template");
    }
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm("Delete this template?")) deleteTplMut.mutate({ id });
  };

  const handlePreview = () => setPreviewOpen(true);
  const handleGeneratePdf = () => {
    const url = `/pdf-render?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&projectId=${encodeURIComponent(projectId)}`;
    window.open(url, "_blank");
  };

  const insertToken = (token: string) => {
    if (!selectedCellId || !selectedCell || selectedCell.type !== "text") {
      toast.info("Select a text cell first");
      return;
    }
    const currentText = (selectedCell.content as any).text || "";
    updateCellContent(selectedCellId, { text: currentText + `{{${token}}}` });
  };

  const pageDims = getPageSize(layout.page);
  const pageWpx = pageDims.w * MM_TO_PX * zoom;
  const pageHpx = pageDims.h * MM_TO_PX * zoom;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <header className="shrink-0 border-b bg-card px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <a
            href={backHref}
            className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </a>
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">PDF Designer</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground font-mono">{entityType}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-5 bg-border mx-0.5" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setHelpOpen(true)}
            title="Help & Shortcuts (?)"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setLoadTplOpen(true)}
          >
            <FolderOpen className="h-3 w-3" /> Load
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setSaveTplOpen(true)}
          >
            <Save className="h-3 w-3" /> Save Template
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={handlePreview}
          >
            <Eye className="h-3 w-3" /> Preview
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleGeneratePdf}>
            <FileText className="h-3 w-3" /> Generate PDF
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Blocks + Tokens */}
        <DesignerSidebar
          entityType={entityType}
          selectedCell={selectedCell}
          tokenSearch={tokenSearch}
          setTokenSearch={setTokenSearch}
          onAddCell={addCell}
          onInsertToken={insertToken}
        />

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-secondary dark:bg-[var(--navy-mid)] p-6 flex items-start justify-center">
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3 text-xs">
              <button
                onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
                className="h-6 w-6 rounded border bg-card text-xs"
              >
                −
              </button>
              <span className="text-muted-foreground font-mono w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
                className="h-6 w-6 rounded border bg-card text-xs"
              >
                +
              </button>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{layout.cells.length} cells</span>
            </div>

            <div className="relative" style={{ width: pageWpx, height: pageHpx }}>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)`,
                  backgroundSize: `${5 * MM_TO_PX * zoom}px ${5 * MM_TO_PX * zoom}px`,
                  width: pageWpx,
                  height: pageHpx,
                }}
              />

              {layout.cells.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center max-w-xs">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">Empty canvas</p>
                    <p className="text-xs text-muted-foreground/70 mb-3">
                      Drag a block from the left sidebar, or click to add.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="pointer-events-auto h-7 text-xs gap-1"
                      onClick={() => setGalleryOpen(true)}
                    >
                      <Layout className="h-3 w-3" /> Browse Starter Templates
                    </Button>
                  </div>
                </div>
              )}

              <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
                <ReportRenderer
                  layout={layout}
                  entityType={entityType}
                  data={data}
                  scale={zoom}
                />
              </div>

              {guides.v.map((x, i) => (
                <div
                  key={`v-${i}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: x * MM_TO_PX * zoom,
                    top: 0,
                    width: 1,
                    height: "100%",
                    background: "#ef4444",
                    boxShadow: "0 0 0 0.5px #ef4444",
                    zIndex: 1000,
                  }}
                />
              ))}
              {guides.h.map((y, i) => (
                <div
                  key={`h-${i}`}
                  className="absolute pointer-events-none"
                  style={{
                    top: y * MM_TO_PX * zoom,
                    left: 0,
                    height: 1,
                    width: "100%",
                    background: "#ef4444",
                    boxShadow: "0 0 0 0.5px #ef4444",
                    zIndex: 1000,
                  }}
                />
              ))}

              {[...layout.cells]
                .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                .map((cell) => (
                  <CellOverlay
                    key={cell.id}
                    cell={cell}
                    zoom={zoom}
                    selected={selectedCellIds.has(cell.id)}
                    isEditing={editingCellId === cell.id}
                    otherCells={layout.cells.filter((c) => c.id !== cell.id)}
                    onSelect={(shiftKey) => selectCell(cell.id, shiftKey)}
                    onMove={(x, y) => updateCell(cell.id, { x, y })}
                    onResize={(w, h) => updateCell(cell.id, { w, h })}
                    onDelete={() => deleteCell(cell.id)}
                    onDuplicate={() => duplicateCell(cell.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, cellId: cell.id });
                    }}
                    onDoubleClick={() => {
                      if (cell.type === "text" && !cell.locked) setEditingCellId(cell.id);
                    }}
                    onEditCommit={(text) => {
                      updateCellContent(cell.id, { text });
                      setEditingCellId(null);
                    }}
                    onEditCancel={() => setEditingCellId(null)}
                    onGuidesChange={setGuides}
                  />
                ))}

              <div
                className="absolute inset-0"
                style={{ zIndex: -1 }}
                onClick={(e) => {
                  if (!e.shiftKey) selectNone();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const type = e.dataTransfer.getData("application/x-block-type") as CellType;
                  if (!type) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / (MM_TO_PX * zoom);
                  const y = (e.clientY - rect.top) / (MM_TO_PX * zoom);
                  addCell(type, { x: Math.round(x), y: Math.round(y) });
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono px-1">
              <div className="flex items-center gap-3">
                <span>
                  {layout.page.paper} {layout.page.orientation}
                </span>
                <span>·</span>
                <span>
                  {pageDims.w}×{pageDims.h}mm
                </span>
                <span>·</span>
                <span>
                  {layout.cells.length} cell{layout.cells.length !== 1 ? "s" : ""}
                </span>
                {selectedCell && (
                  <>
                    <span>·</span>
                    <span className="text-primary">
                      selected: {selectedCell.type} ({selectedCell.x},{selectedCell.y}){" "}
                      {selectedCell.w}×{selectedCell.h}mm
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                {canUndo && <span>undo available</span>}
                {canRedo && <span>· redo available</span>}
                <span>·</span>
                <span>snap: 1mm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Properties */}
        <aside className="w-64 shrink-0 border-l bg-card overflow-y-auto">
          {selectedCell ? (
            <PropertiesPanel
              cell={selectedCell}
              entityType={entityType}
              onUpdate={(patch) => updateCell(selectedCell.id, patch)}
              onUpdateStyle={(patch) => updateCellStyle(selectedCell.id, patch)}
              onUpdateContent={(patch) => updateCellContent(selectedCell.id, patch)}
              onDelete={() => deleteCell(selectedCell.id)}
              onDuplicate={() => duplicateCell(selectedCell.id)}
              onBringToFront={() => bringToFront([selectedCell.id])}
              onSendToBack={() => sendToBack([selectedCell.id])}
              onToggleLock={() => toggleLock([selectedCell.id])}
            />
          ) : selectedCellIds.size > 1 ? (
            <MultiSelectPanel
              count={selectedCellIds.size}
              onDelete={deleteSelectedCells}
              onDuplicate={duplicateSelectedCells}
              onBringToFront={() => bringToFront(Array.from(selectedCellIds))}
              onSendToBack={() => sendToBack(Array.from(selectedCellIds))}
              onToggleLock={() => toggleLock(Array.from(selectedCellIds))}
              onUpdateStyle={updateSelectedCellsStyle}
            />
          ) : (
            <PageSettingsPanel page={layout.page} onUpdate={updatePage} />
          )}
        </aside>
      </div>

      {/* Dialogs */}
      <SaveTemplateDialog
        open={saveTplOpen}
        onOpenChange={setSaveTplOpen}
        tplName={tplName}
        setTplName={setTplName}
        tplScope={tplScope}
        setTplScope={setTplScope}
        onSave={handleSaveTemplate}
        isPending={createTplMut.isPending}
      />
      <LoadTemplateDialog
        open={loadTplOpen}
        onOpenChange={setLoadTplOpen}
        templates={templates}
        isLoading={tplLoading}
        onLoad={handleLoadTemplate}
        onDelete={handleDeleteTemplate}
      />
      <PreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        layout={layout}
        entityType={entityType}
        data={data}
        onGeneratePdf={handleGeneratePdf}
      />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      {contextMenu && (
        <ContextMenu
          contextMenu={contextMenu}
          onClose={() => setContextMenu(null)}
          cells={layout.cells}
          selectedCellIds={selectedCellIds}
          setSelectedCellIds={setSelectedCellIds}
          duplicateCell={duplicateCell}
          bringToFront={bringToFront}
          sendToBack={sendToBack}
          toggleLock={toggleLock}
          deleteCell={deleteCell}
        />
      )}
      <StarterGalleryDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        entityType={entityType}
        onSelectLayout={resetLayout}
      />
    </div>
  );
}
