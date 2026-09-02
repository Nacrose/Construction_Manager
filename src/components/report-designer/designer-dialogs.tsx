"use client";

import { useState } from "react";
import { type ReportLayout, starterLayoutDailyReport, starterLayoutSchedule, genCellId } from "@/lib/report-tokens";
import { ReportRenderer } from "./report-renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Save,
  Trash2,
  Copy,
  FileText,
  Loader2,
  HelpCircle,
  MousePointerClick,
  Lock,
  BringToFront,
  SendToBack,
  Layout,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SaveTemplateDialog({
  open,
  onOpenChange,
  tplName,
  setTplName,
  tplScope,
  setTplScope,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tplName: string;
  setTplName: (name: string) => void;
  tplScope: "global" | "project" | "user";
  setTplScope: (scope: "global" | "project" | "user") => void;
  onSave: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Save the current layout so you can reuse it for other reports. Templates are scoped by
            visibility.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Template Name</Label>
            <Input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="e.g. My Company — Standard DSR"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Scope</Label>
            <Select value={tplScope} onValueChange={(v: any) => setTplScope(v)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Private (just me)</SelectItem>
                <SelectItem value="project">Project (all members of this project)</SelectItem>
                <SelectItem value="global">Global (everyone in organization)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Global scope requires org admin role. Project scope is visible to all members of this
              project.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isPending}>
            {isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LoadTemplateDialog({
  open,
  onOpenChange,
  templates,
  isLoading,
  onLoad,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: any[];
  isLoading: boolean;
  onLoad: (tpl: any) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Load Template</DialogTitle>
          <DialogDescription>
            Replace the current layout with a saved template. Your current unsaved changes will be
            lost.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2 max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-6">
              <Loader2 className="h-4 w-4 animate-spin inline" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              No saved templates yet. Save your current layout as a template to reuse it.
            </div>
          ) : (
            templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center gap-2 rounded-md border p-2 hover:bg-muted/30"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{tpl.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {tpl.scope} · by {tpl.owner?.name ?? "—"} ·{" "}
                    {new Date(tpl.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onLoad(tpl)}
                >
                  Load
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => onDelete(tpl.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PreviewModal({
  open,
  onOpenChange,
  layout,
  entityType,
  data,
  onGeneratePdf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: ReportLayout;
  entityType: string;
  data: any;
  onGeneratePdf: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview — {entityType}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center bg-muted dark:bg-[var(--navy-mid)] p-4 rounded">
          <ReportRenderer layout={layout} entityType={entityType} data={data} scale={0.8} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onGeneratePdf}>Open Print View (PDF)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" /> PDF Designer — Quick Guide
          </DialogTitle>
          <DialogDescription>
            A cell-based designer for building custom PDF reports. Think of it as a spreadsheet
            where each cell can be text, a table, a KPI, an image, a divider, or a signature block.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-sm">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" /> Getting Started
            </h3>
            <ol className="list-decimal ml-5 space-y-1 text-xs">
              <li>
                <strong>Add blocks</strong> from the left sidebar — click any of the 6 block types
                (Text, Table, KPI, Image, Divider, Signature).
              </li>
              <li>
                <strong>Position</strong> by dragging the cell. <strong>Resize</strong> using the
                bottom-right handle. Positions snap to a 1mm grid.
              </li>
              <li>
                <strong>Edit content</strong> in the right sidebar — text, table columns, KPI
                metric, image source, etc.
              </li>
              <li>
                <strong>Insert data tokens</strong> by clicking any token in the left sidebar (e.g.{" "}
                <code className="bg-muted px-1 rounded text-[10px]">{`{{report.number}}`}</code>).
                The token is appended to the selected text cell.
              </li>
              <li>
                <strong>Save as Template</strong> to reuse this layout across reports. Pick a scope:
                Private (just me), Project (all members), or Global (org-wide).
              </li>
              <li>
                <strong>Preview</strong> opens an inline preview. <strong>Generate PDF</strong>{" "}
                opens a printable view in a new tab — the browser print dialog fires automatically;
                choose &quot;Save as PDF&quot;.
              </li>
            </ol>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Block Types
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <strong className="text-info">Text</strong> — free text with{" "}
                <code className="bg-muted px-1 rounded text-[10px]">{`{{tokens}}`}</code> that get
                replaced with live data.
              </div>
              <div>
                <strong className="text-amber-600">Table</strong> — pick an entity (workforce,
                equipment, etc.) and which columns to show.
              </div>
              <div>
                <strong className="text-emerald-600">KPI Card</strong> — large number + small
                label, sourced from any token.
              </div>
              <div>
                <strong className="text-violet-600">Image</strong> — logo, photo, or signature
                placeholder. Upload (&lt;500KB) or paste URL.
              </div>
              <div>
                <strong className="text-muted-foreground">Divider</strong> — horizontal or vertical line,
                custom thickness/color.
              </div>
              <div>
                <strong className="text-pink-600">Signature</strong> — prepared by / submitted to
                client / client approved stamps with auto-filled names &amp; dates.
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Keyboard Shortcuts
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <Kbd label="Ctrl + Z" desc="Undo" />
              <Kbd label="Ctrl + Shift + Z" desc="Redo (or Ctrl + Y)" />
              <Kbd label="Delete / Backspace" desc="Delete selected cell" />
              <Kbd label="Ctrl + D" desc="Duplicate selected cell" />
              <Kbd label="↑ ↓ ← →" desc="Nudge selected cell by 1mm" />
              <Kbd label="Shift + Arrow" desc="Nudge by 5mm" />
              <Kbd label="?" desc="Open this help dialog" />
              <Kbd label="Click empty canvas" desc="Deselect (show Page Settings)" />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StarterGalleryDialog({
  open,
  onOpenChange,
  entityType,
  onSelectLayout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  onSelectLayout: (layout: ReportLayout) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layout className="h-4 w-4" /> Starter Templates
          </DialogTitle>
          <DialogDescription>
            Pick a pre-built layout to start from. You can customize everything after loading.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          {entityType === "schedule" ? (
            <>
              <GalleryCard
                title="Standard Schedule Header"
                desc="Clean template with Logo, project/schedule info fields, and horizontal separating rule. Blue/Slate accent."
                onClick={() => {
                  onSelectLayout(starterLayoutSchedule());
                  onOpenChange(false);
                  toast.success("Loaded Standard Schedule Header template");
                }}
              />
              <GalleryCard
                title="Blank A3 Canvas"
                desc="Start from scratch with an empty A3 Landscape page. Add header components freely."
                onClick={() => {
                  onSelectLayout({
                    page: {
                      paper: "A3",
                      orientation: "landscape",
                      margin: { top: 15, right: 15, bottom: 15, left: 15 },
                    },
                    cells: [],
                  });
                  onOpenChange(false);
                  toast.success("Started with blank A3 canvas");
                }}
              />
            </>
          ) : (
            <>
              <GalleryCard
                title="Standard DSR"
                desc="Clean modern layout with KPI cards, weather, workforce table, equipment table, and signature stamps. Emerald accent."
                onClick={() => {
                  onSelectLayout(starterLayoutDailyReport());
                  onOpenChange(false);
                  toast.success("Loaded Standard DSR template");
                }}
              />
              <GalleryCard
                title="Blank Canvas"
                desc="Start from scratch with an empty page. Add blocks one by one from the sidebar."
                onClick={() => {
                  onSelectLayout({
                    page: {
                      paper: "A4",
                      orientation: "portrait",
                      margin: { top: 15, right: 15, bottom: 15, left: 15 },
                    },
                    cells: [],
                  });
                  onOpenChange(false);
                  toast.success("Started with blank canvas");
                }}
              />
              <GalleryCard
                title="Minimal Text-only"
                desc="Just a title and a text body. Perfect for simple memo-style reports."
                onClick={() => {
                  onSelectLayout({
                    page: {
                      paper: "A4",
                      orientation: "portrait",
                      margin: { top: 20, right: 20, bottom: 20, left: 20 },
                    },
                    cells: [
                      {
                        id: genCellId(),
                        type: "text",
                        x: 20,
                        y: 20,
                        w: 170,
                        h: 14,
                        content: { type: "text", text: "{{report.number}}" } as any,
                        style: {
                          fontSize: 18,
                          bold: true,
                          color: "#111827",
                          align: "left",
                          valign: "middle",
                        },
                      },
                      {
                        id: genCellId(),
                        type: "text",
                        x: 20,
                        y: 40,
                        w: 170,
                        h: 200,
                        content: {
                          type: "text",
                          text: "Type your report content here...\n\nUse {{tokens}} from the sidebar to insert live data.",
                        } as any,
                        style: { fontSize: 11, align: "left", valign: "top" },
                      },
                    ],
                  });
                  onOpenChange(false);
                  toast.success("Loaded Minimal template");
                }}
              />
              <GalleryCard
                title="Government Format"
                desc="Navy header with bordered sections. Suitable for standard engineering reports."
                onClick={() => {
                  const layout = starterLayoutDailyReport();
                  layout.cells = layout.cells.map((c) => ({
                    ...c,
                    style: {
                      ...c.style,
                      color: c.style.color === "#059669" ? "#1e3a8a" : c.style.color,
                    },
                  }));
                  onSelectLayout(layout);
                  onOpenChange(false);
                  toast.success("Loaded Government Format template");
                }}
              />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContextMenu({
  contextMenu,
  onClose,
  cells,
  selectedCellIds,
  setSelectedCellIds,
  duplicateCell,
  bringToFront,
  sendToBack,
  toggleLock,
  deleteCell,
}: {
  contextMenu: { x: number; y: number; cellId: string };
  onClose: () => void;
  cells: any[];
  selectedCellIds: Set<string>;
  setSelectedCellIds: (s: Set<string>) => void;
  duplicateCell: (id: string) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  toggleLock: (ids: string[]) => void;
  deleteCell: (id: string) => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-[200]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-[201] min-w-[180px] rounded-md border bg-popover p-1 shadow-lg"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        <ContextMenuItem
          icon={Copy}
          label="Duplicate"
          shortcut="Ctrl+D"
          onClick={() => {
            const id = contextMenu.cellId;
            if (!selectedCellIds.has(id)) setSelectedCellIds(new Set([id]));
            duplicateCell(id);
            onClose();
          }}
        />
        <ContextMenuItem
          icon={BringToFront}
          label="Bring to Front"
          onClick={() => {
            bringToFront([contextMenu.cellId]);
            onClose();
          }}
        />
        <ContextMenuItem
          icon={SendToBack}
          label="Send to Back"
          onClick={() => {
            sendToBack([contextMenu.cellId]);
            onClose();
          }}
        />
        <ContextMenuItem
          icon={Lock}
          label={cells.find((c) => c.id === contextMenu.cellId)?.locked ? "Unlock" : "Lock"}
          onClick={() => {
            toggleLock([contextMenu.cellId]);
            onClose();
          }}
        />
        <div className="h-px bg-border my-1" />
        <ContextMenuItem
          icon={Trash2}
          label="Delete"
          shortcut="Del"
          destructive
          onClick={() => {
            const cell = cells.find((c) => c.id === contextMenu.cellId);
            if (cell?.locked) {
              toast.info("Cell is locked — unlock it first");
            } else {
              deleteCell(contextMenu.cellId);
            }
            onClose();
          }}
        />
      </div>
    </>
  );
}

function ContextMenuItem({
  icon: Icon,
  label,
  shortcut,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs text-left hover:bg-muted transition-colors",
        destructive && "text-destructive hover:bg-destructive/10"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[9px] text-muted-foreground font-mono">{shortcut}</span>}
    </button>
  );
}

function GalleryCard({
  title,
  desc,
  onClick,
}: {
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-border bg-card p-3 text-left hover:border-primary/50 hover:bg-primary/5 transition-colors"
    >
      <div className="text-sm font-semibold mb-1">{title}</div>
      <p className="text-[11px] text-muted-foreground leading-tight">{desc}</p>
    </button>
  );
}

function Kbd({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-center gap-2">
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">{label}</kbd>
      <span className="text-muted-foreground">{desc}</span>
    </div>
  );
}
