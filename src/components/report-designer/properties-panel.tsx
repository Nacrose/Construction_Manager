"use client";

import {
  type ReportLayout,
  type Cell,
  type CellStyle,
  getTableSchema,
  getTableEntitiesForEntity,
  getTokensForEntity,
  TABLE_SCHEMAS,
} from "@/lib/report-tokens";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Copy, Lock, BringToFront, SendToBack, Settings } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PropertiesPanel({
  cell,
  entityType,
  onUpdate,
  onUpdateStyle,
  onUpdateContent,
  onDelete,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onToggleLock,
}: {
  cell: Cell;
  entityType: string;
  onUpdate: (patch: Partial<Cell>) => void;
  onUpdateStyle: (patch: Partial<CellStyle>) => void;
  onUpdateContent: (patch: any) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onToggleLock: () => void;
}) {
  const tableEntities = getTableEntitiesForEntity(entityType);
  const tableSchema =
    cell.content.type === "table" ? getTableSchema((cell.content as any).entity) : null;

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Settings className="h-3 w-3" /> {cell.type} cell
        </h3>
        <div className="flex gap-0.5">
          <button
            onClick={onBringToFront}
            className="h-6 w-6 rounded border hover:bg-muted flex items-center justify-center"
            title="Bring to Front"
          >
            <BringToFront className="h-3 w-3" />
          </button>
          <button
            onClick={onSendToBack}
            className="h-6 w-6 rounded border hover:bg-muted flex items-center justify-center"
            title="Send to Back"
          >
            <SendToBack className="h-3 w-3" />
          </button>
          <button
            onClick={onToggleLock}
            className={`h-6 w-6 rounded border flex items-center justify-center ${cell.locked ? "bg-amber-100 text-amber-700 border-amber-300" : "hover:bg-muted"}`}
            title={cell.locked ? "Unlock" : "Lock"}
          >
            <Lock className="h-3 w-3" />
          </button>
          <button
            onClick={onDuplicate}
            className="h-6 w-6 rounded border hover:bg-muted flex items-center justify-center"
            title="Duplicate"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            className="h-6 w-6 rounded border hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Position & size */}
      <Section title="Position & Size">
        <div className="grid grid-cols-2 gap-1.5">
          <LabeledInput
            label="X (mm)"
            type="number"
            value={cell.x}
            onChange={(v) => onUpdate({ x: v })}
          />
          <LabeledInput
            label="Y (mm)"
            type="number"
            value={cell.y}
            onChange={(v) => onUpdate({ y: v })}
          />
          <LabeledInput
            label="W (mm)"
            type="number"
            value={cell.w}
            onChange={(v) => onUpdate({ w: Math.max(5, v) })}
          />
          <LabeledInput
            label="H (mm)"
            type="number"
            value={cell.h}
            onChange={(v) => onUpdate({ h: Math.max(3, v) })}
          />
        </div>
      </Section>

      {/* Content (per type) */}
      {cell.content.type === "text" && (
        <Section title="Text Content">
          <Textarea
            value={(cell.content as any).text}
            onChange={(e) => onUpdateContent({ text: e.target.value })}
            rows={4}
            className="text-xs font-mono"
            placeholder="Use {{tokens}} from the sidebar..."
          />
          <p className="text-[10px] text-muted-foreground">
            Tip: click tokens in the left sidebar to insert them at the end.
          </p>
        </Section>
      )}

      {cell.content.type === "table" && (
        <Section title="Table Content">
          <div className="space-y-2">
            <div>
              <Label className="text-[10px]">Entity</Label>
              <Select
                value={(cell.content as any).entity}
                onValueChange={(v) => {
                  const schema = getTableSchema(v);
                  onUpdateContent({
                    entity: v,
                    columns: schema?.columns.map((c) => c.id) ?? [],
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tableEntities.map((e) => {
                    const s = TABLE_SCHEMAS[e];
                    return (
                      <SelectItem key={e} value={e}>
                        {s?.label ?? e}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">
                Columns (toggle to show/hide, drag slider for width)
              </Label>
              <div className="space-y-1.5 mt-1">
                {tableSchema?.columns.map((c) => {
                  const checked = (cell.content as any).columns.includes(c.id);
                  const currentWidth =
                    (cell.content as any).columnWidths?.[c.id] ?? c.width ?? 1;
                  return (
                    <div key={c.id} className="space-y-0.5">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const cols = (cell.content as any).columns as string[];
                            onUpdateContent({
                              columns: v
                                ? [...cols, c.id]
                                : cols.filter((x) => x !== c.id),
                            });
                          }}
                        />
                        <span className="text-[11px] flex-1">{c.label}</span>
                        {checked && (
                          <span className="text-[9px] text-muted-foreground font-mono w-8 text-right">
                            {Math.round(currentWidth * 10) / 10}
                          </span>
                        )}
                      </label>
                      {checked && (
                        <input
                          type="range"
                          min={0.3}
                          max={5}
                          step={0.1}
                          value={currentWidth}
                          onChange={(e) => {
                            const colWidths = {
                              ...((cell.content as any).columnWidths ?? {}),
                            };
                            colWidths[c.id] = parseFloat(e.target.value);
                            onUpdateContent({ columnWidths: colWidths });
                          }}
                          className="w-full h-1 ml-5 accent-primary"
                          title={`Relative width: ${currentWidth}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">
                Width is relative — a column with width 2 takes twice the space of width 1. Uncheck
                a column to hide it.
              </p>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={(cell.content as any).showHeader !== false}
                onCheckedChange={(v) => onUpdateContent({ showHeader: v === true })}
              />
              <span className="text-[11px]">Show header row</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={(cell.content as any).zebra === true}
                onCheckedChange={(v) => onUpdateContent({ zebra: v === true })}
              />
              <span className="text-[11px]">Zebra striping</span>
            </label>
          </div>
        </Section>
      )}

      {cell.content.type === "kpi" && (
        <Section title="KPI Content">
          <div className="space-y-2">
            <div>
              <Label className="text-[10px]">Metric</Label>
              <Select
                value={(cell.content as any).metric}
                onValueChange={(v) => onUpdateContent({ metric: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getTokensForEntity(entityType).map((t) => (
                    <SelectItem key={t.token} value={t.token}>
                      {t.label} ({`{{${t.token}}}`})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Label (shown under value)</Label>
              <Input
                value={(cell.content as any).label}
                onChange={(e) => onUpdateContent({ label: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </Section>
      )}

      {cell.content.type === "image" && (
        <Section title="Image Content">
          <div className="space-y-2">
            <div>
              <Label className="text-[10px]">Source URL (or data URL)</Label>
              <Textarea
                value={(cell.content as any).src}
                onChange={(e) => onUpdateContent({ src: e.target.value })}
                rows={3}
                className="text-xs font-mono"
                placeholder="https://... or data:image/png;base64,..."
              />
            </div>
            <div>
              <Label className="text-[10px]">Fit</Label>
              <Select
                value={(cell.content as any).fit || "contain"}
                onValueChange={(v) => onUpdateContent({ fit: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contain">Contain</SelectItem>
                  <SelectItem value="cover">Cover</SelectItem>
                  <SelectItem value="fill">Fill</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="block">
              <Label className="text-[10px]">Upload file</Label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 500_000) {
                    toast.error("File must be < 500 KB");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onloadend = () =>
                    onUpdateContent({ src: reader.result as string });
                  reader.readAsDataURL(f);
                }}
                className="text-[10px] w-full mt-1"
              />
            </label>
          </div>
        </Section>
      )}

      {cell.content.type === "divider" && (
        <Section title="Divider">
          <div className="space-y-2">
            <div>
              <Label className="text-[10px]">Orientation</Label>
              <Select
                value={(cell.content as any).orientation}
                onValueChange={(v) => onUpdateContent({ orientation: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="horizontal">Horizontal</SelectItem>
                  <SelectItem value="vertical">Vertical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <LabeledInput
              label="Thickness"
              type="number"
              value={(cell.content as any).thickness ?? 1}
              onChange={(v) => onUpdateContent({ thickness: v })}
            />
          </div>
        </Section>
      )}

      {cell.content.type === "signature" && (
        <Section title="Signature">
          <div>
            <Label className="text-[10px]">Role</Label>
            <Select
              value={(cell.content as any).role}
              onValueChange={(v) => onUpdateContent({ role: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prepared">Prepared by</SelectItem>
                <SelectItem value="submitted">Submitted to Client</SelectItem>
                <SelectItem value="approved">Client Approved</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(cell.content as any).role === "custom" && (
            <div className="mt-2">
              <Label className="text-[10px]">Custom Label</Label>
              <Input
                value={(cell.content as any).customLabel || ""}
                onChange={(e) => onUpdateContent({ customLabel: e.target.value })}
                className="h-8 text-xs"
                placeholder="e.g. Verified by Engineer"
              />
            </div>
          )}
        </Section>
      )}

      {/* Style */}
      <Section title="Style">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <LabeledInput
              label="Font (pt)"
              type="number"
              value={cell.style.fontSize ?? 10}
              onChange={(v) => onUpdateStyle({ fontSize: v })}
            />
            <div>
              <Label className="text-[10px]">Font Family</Label>
              <Select
                value={cell.style.fontFamily || "system"}
                onValueChange={(v) => onUpdateStyle({ fontFamily: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="serif">Serif</SelectItem>
                  <SelectItem value="sans-serif">Sans-serif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-1.5">
            <ToggleChip
              active={Boolean(cell.style.bold)}
              onClick={() => onUpdateStyle({ bold: !cell.style.bold })}
              title="Bold"
            >
              <span className="font-bold">B</span>
            </ToggleChip>
            <ToggleChip
              active={Boolean(cell.style.italic)}
              onClick={() => onUpdateStyle({ italic: !cell.style.italic })}
              title="Italic"
            >
              <span className="italic">I</span>
            </ToggleChip>
            <ToggleChip
              active={Boolean(cell.style.underline)}
              onClick={() => onUpdateStyle({ underline: !cell.style.underline })}
              title="Underline"
            >
              <span className="underline">U</span>
            </ToggleChip>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <Label className="text-[10px]">Align</Label>
              <Select
                value={cell.style.align || "left"}
                onValueChange={(v: any) => onUpdateStyle({ align: v })}
              >
                <SelectTrigger className="h-8 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">L</SelectItem>
                  <SelectItem value="center">C</SelectItem>
                  <SelectItem value="right">R</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <ColorInput
              label="Text"
              value={cell.style.color}
              onChange={(v) => onUpdateStyle({ color: v })}
            />
            <ColorInput
              label="Background"
              value={cell.style.bg}
              onChange={(v) => onUpdateStyle({ bg: v })}
              allowEmpty
            />
          </div>

          <div>
            <Label className="text-[10px]">Border</Label>
            <Select
              value={cell.style.border || "none"}
              onValueChange={(v: any) => onUpdateStyle({ border: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="all">All sides</SelectItem>
                <SelectItem value="bottom">Bottom only</SelectItem>
                <SelectItem value="top">Top only</SelectItem>
                <SelectItem value="left">Left only</SelectItem>
                <SelectItem value="right">Right only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {cell.style.border && cell.style.border !== "none" && (
            <div className="grid grid-cols-2 gap-1.5">
              <ColorInput
                label="Border Color"
                value={cell.style.borderColor}
                onChange={(v) => onUpdateStyle({ borderColor: v })}
              />
              <LabeledInput
                label="Border Width"
                type="number"
                value={cell.style.borderWidth ?? 1}
                onChange={(v) => onUpdateStyle({ borderWidth: v })}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <LabeledInput
              label="Padding (pt)"
              type="number"
              value={cell.style.padding ?? 0}
              onChange={(v) => onUpdateStyle({ padding: v })}
            />
            <LabeledInput
              label="Radius (px)"
              type="number"
              value={cell.style.borderRadius ?? 0}
              onChange={(v) => onUpdateStyle({ borderRadius: v })}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

export function MultiSelectPanel({
  count,
  onDelete,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onToggleLock,
  onUpdateStyle,
}: {
  count: number;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onToggleLock: () => void;
  onUpdateStyle: (patch: Partial<CellStyle>) => void;
}) {
  return (
    <div className="p-3 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Settings className="h-3 w-3" /> {count} cells selected
      </h3>
      <p className="text-[10px] text-muted-foreground">
        Bulk actions apply to all selected cells. Click a single cell to edit its individual
        properties.
      </p>

      <div className="grid grid-cols-3 gap-1">
        <button
          onClick={onBringToFront}
          className="h-8 rounded border hover:bg-muted flex items-center justify-center"
          title="Bring to Front"
        >
          <BringToFront className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onSendToBack}
          className="h-8 rounded border hover:bg-muted flex items-center justify-center"
          title="Send to Back"
        >
          <SendToBack className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onToggleLock}
          className="h-8 rounded border hover:bg-muted flex items-center justify-center"
          title="Lock/Unlock"
        >
          <Lock className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDuplicate}
          className="h-8 rounded border hover:bg-muted flex items-center justify-center"
          title="Duplicate"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="h-8 rounded border col-span-2 hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center gap-1 text-xs"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete All
        </button>
      </div>

      <Section title="Bulk Style">
        <div className="space-y-2">
          <div className="flex gap-1">
            <ToggleChip active={false} onClick={() => onUpdateStyle({ bold: true })}>
              <span className="font-bold">B</span>
            </ToggleChip>
            <ToggleChip active={false} onClick={() => onUpdateStyle({ italic: true })}>
              <span className="italic">I</span>
            </ToggleChip>
            <ToggleChip active={false} onClick={() => onUpdateStyle({ underline: true })}>
              <span className="underline">U</span>
            </ToggleChip>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <ColorInput label="Text" onChange={(v) => onUpdateStyle({ color: v })} />
            <ColorInput
              label="Background"
              onChange={(v) => onUpdateStyle({ bg: v })}
              allowEmpty
            />
          </div>
          <div>
            <Label className="text-[10px]">Border</Label>
            <Select
              value=""
              onValueChange={(v: any) =>
                onUpdateStyle({ border: v, borderColor: "#d1d5db", borderWidth: 1 })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Apply to all..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="all">All sides</SelectItem>
                <SelectItem value="bottom">Bottom only</SelectItem>
                <SelectItem value="top">Top only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>
    </div>
  );
}

export function PageSettingsPanel({
  page,
  onUpdate,
}: {
  page: ReportLayout["page"];
  onUpdate: (patch: Partial<ReportLayout["page"]>) => void;
}) {
  return (
    <div className="p-3 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Settings className="h-3 w-3" /> Page Settings
      </h3>
      <p className="text-[10px] text-muted-foreground">
        Click a cell to edit it. Click empty canvas to see these settings.
      </p>

      <Section title="Paper">
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <Label className="text-[10px]">Size</Label>
            <Select
              value={page.paper}
              onValueChange={(v: any) => onUpdate({ paper: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="A3">A3</SelectItem>
                <SelectItem value="Letter">Letter</SelectItem>
                <SelectItem value="Legal">Legal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Orientation</Label>
            <Select
              value={page.orientation}
              onValueChange={(v: any) => onUpdate({ orientation: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Margins (mm)">
        <div className="grid grid-cols-2 gap-1.5">
          <LabeledInput
            label="Top"
            type="number"
            value={page.margin.top}
            onChange={(v) => onUpdate({ margin: { ...page.margin, top: v } })}
          />
          <LabeledInput
            label="Bottom"
            type="number"
            value={page.margin.bottom}
            onChange={(v) => onUpdate({ margin: { ...page.margin, bottom: v } })}
          />
          <LabeledInput
            label="Left"
            type="number"
            value={page.margin.left}
            onChange={(v) => onUpdate({ margin: { ...page.margin, left: v } })}
          />
          <LabeledInput
            label="Right"
            type="number"
            value={page.margin.right}
            onChange={(v) => onUpdate({ margin: { ...page.margin, right: v } })}
          />
        </div>
      </Section>

      <Section title="Watermark">
        <div className="space-y-1.5">
          <Input
            value={page.watermark?.text || ""}
            onChange={(e) =>
              onUpdate({
                watermark: e.target.value
                  ? {
                      text: e.target.value,
                      color: page.watermark?.color || "#f3f4f6",
                      opacity: page.watermark?.opacity ?? 0.6,
                    }
                  : undefined,
              })
            }
            placeholder="e.g. DRAFT, CONFIDENTIAL"
            className="h-8 text-xs"
          />
          {page.watermark && (
            <div className="grid grid-cols-2 gap-1.5">
              <ColorInput
                label="Color"
                value={page.watermark.color}
                onChange={(v) =>
                  onUpdate({ watermark: { ...page.watermark!, color: v } })
                }
              />
              <LabeledInput
                label="Opacity"
                type="number"
                value={page.watermark.opacity}
                onChange={(v) =>
                  onUpdate({
                    watermark: {
                      ...page.watermark!,
                      opacity: Math.min(1, Math.max(0, v)),
                    },
                  })
                }
              />
            </div>
          )}
        </div>
      </Section>

      <Section title="Header / Footer Notes">
        <div className="space-y-1.5">
          <div>
            <Label className="text-[10px]">Header Note (amber)</Label>
            <Input
              value={page.headerNote || ""}
              onChange={(e) => onUpdate({ headerNote: e.target.value || undefined })}
              placeholder="For client review only"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Footer Note (green)</Label>
            <Input
              value={page.footerNote || ""}
              onChange={(e) => onUpdate({ footerNote: e.target.value || undefined })}
              placeholder="Generated by Construction Manager"
              className="h-8 text-xs"
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

export function LabeledInput({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: "number" | "text";
  value: number | string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) =>
          onChange(
            type === "number" ? parseFloat(e.target.value) || 0 : (e.target.value as any)
          )
        }
        className="h-8 text-xs"
      />
    </div>
  );
}

export function ColorInput({
  label,
  value,
  onChange,
  allowEmpty,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={value || "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 rounded border cursor-pointer shrink-0"
        />
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={allowEmpty ? "transparent" : "#000000"}
          className="h-8 text-xs font-mono"
        />
        {allowEmpty && value && (
          <button
            onClick={() => onChange("")}
            className="h-8 w-6 rounded border text-xs hover:bg-muted shrink-0"
            title="Clear"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export function ToggleChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-8 w-8 rounded border text-xs flex items-center justify-center",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
