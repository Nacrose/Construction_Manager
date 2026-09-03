import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RfiPriorityBadge } from "@/components/workflow/badges";
import type { RfiStatus } from "@/components/workflow/rfi-types";
import { GripVertical, Calendar, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type RfiListItem = {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  discipline: string | null;
  workDate: string | Date | null;
  createdAt: string | Date;
  assignedTo?: { id: string; user: { id: string; name: string } } | null;
  createdBy?: { id: string; name: string } | null;
};

const COLUMNS = [
  { key: "draft", label: "Draft", color: "bg-muted-foreground/60", border: "border-l-slate-400" },
  { key: "submitted", label: "Submitted", color: "bg-info/70", border: "border-l-info" },
  { key: "approved", label: "Approved", color: "bg-success", border: "border-l-success" },
  { key: "rejected", label: "Rejected", color: "bg-red-500", border: "border-l-red-500" },
  { key: "closed", label: "Closed", color: "bg-zinc-400", border: "border-l-zinc-400" },
];

function UserAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : "U";
  return (
    <div className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[7.5px] font-bold text-white bg-muted/600 select-none", className)}>
      {initials}
    </div>
  );
}

function KanbanCard({ rfi, onOpen }: { rfi: RfiListItem; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rfi.id,
    data: { type: "rfi", rfi },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const statusBorderColor = cn(
    rfi.status === "draft" && "border-l-slate-400 dark:border-l-slate-700",
    rfi.status === "submitted" && "border-l-info dark:border-l-info",
    rfi.status === "approved" && "border-l-success dark:border-l-success",
    rfi.status === "rejected" && "border-l-red-500 dark:border-l-red-600",
    rfi.status === "closed" && "border-l-zinc-400 dark:border-l-zinc-700"
  );

  return (
    <div ref={setNodeRef} style={style} className="mb-1.5">
      <Card
        className={cn(
          "cursor-pointer hover:shadow hover:border-muted-foreground/30 transition-all border-l-[3px]",
          statusBorderColor
        )}
        onClick={() => onOpen(rfi.id)}
      >
        <CardContent className="p-2 space-y-1">
          <div className="flex items-center gap-1">
            <button {...attributes} {...listeners} className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing p-0.5 -ml-1">
              <GripVertical className="h-2.5 w-2.5" />
            </button>
            <span className="font-mono text-[9px] font-bold text-muted-foreground leading-none">{rfi.number}</span>
            <div className="flex-1" />
            <RfiPriorityBadge priority={rfi.priority} className="text-[8px] px-1 py-0 h-3.5 leading-none" />
          </div>
          <p className="text-[11px] font-medium leading-tight line-clamp-2 text-foreground/90 pl-3.5">{rfi.subject}</p>
          <div className="flex items-center justify-between text-[8.5px] text-muted-foreground pl-3.5 pt-0.5 leading-none">
            <div className="flex items-center gap-1">
              {rfi.discipline && (
                <Badge variant="secondary" className="text-[7.5px] font-medium capitalize px-1 py-0 h-3 leading-none">{rfi.discipline}</Badge>
              )}
              {rfi.workDate && new Date(rfi.workDate) < new Date() && (
                <Badge variant="destructive" className="text-[7.5px] px-1 py-0 h-3 leading-none">Overdue</Badge>
              )}
            </div>
            {rfi.assignedTo?.user?.name && (
              <UserAvatar name={rfi.assignedTo.user.name} className="h-3.5 w-3.5 text-[7px] bg-primary" />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KanbanColumn({
  column,
  rfis,
  onOpen,
}: {
  column: (typeof COLUMNS)[number];
  rfis: RfiListItem[];
  onOpen: (id: string) => void;
}) {
  const ids = rfis.map((r) => r.id);

  return (
    <div className="flex flex-col min-w-[200px] max-w-[240px] flex-1">
      <div className="flex items-center gap-1.5 px-2 py-1.5 shrink-0 bg-background/50 border border-b-0 border-border/30 rounded-t-xl">
        <div className={`h-2 w-2 rounded-full ${column.color}`} />
        <span className="text-[11px] font-semibold text-foreground/90">{column.label}</span>
        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 leading-none bg-muted/70 text-muted-foreground font-semibold">{rfis.length}</Badge>
      </div>
      <div className="flex-1 rounded-b-xl bg-muted/10 backdrop-blur-sm border border-border/30 p-2 min-h-[300px]">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {rfis.map((rfi) => (
            <KanbanCard key={rfi.id} rfi={rfi} onOpen={onOpen} />
          ))}
        </SortableContext>
        {rfis.length === 0 && (
          <div className="flex items-center justify-center h-16 text-[9.5px] text-muted-foreground/60 border border-dashed border-border/40 rounded-lg">
            No RFIs
          </div>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({
  rfis,
  onOpenRfi,
  projectId,
}: {
  rfis: RfiListItem[];
  onOpenRfi: (id: string) => void;
  projectId: string;
}) {
  const utils = trpc.useUtils();
  const [activeRfi, setActiveRfi] = useState<RfiListItem | null>(null);

  const updateMutation = trpc.workflow.rfi.update.useMutation({
    onSuccess: () => {
      utils.workflow.rfi.list.invalidate({ projectId });
      toast.success("RFI status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const grouped = COLUMNS.map((col) => ({
    column: col,
    items: rfis.filter((r) => r.status === col.key),
  }));

  function handleDragStart(event: DragStartEvent) {
    const rfi = rfis.find((r) => r.id === event.active.id);
    if (rfi) setActiveRfi(rfi);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveRfi(null);
    const { active, over } = event;
    if (!over) return;

    const activeRfiData = rfis.find((r) => r.id === active.id);
    if (!activeRfiData) return;

    // Determine target column: the droppable is the column container
    // We find which column the "over" item belongs to, or if over is a column
    let targetStatus: string | null = null;
    for (const col of COLUMNS) {
      if (over.id === col.key) {
        targetStatus = col.key;
        break;
      }
      const colRfis = rfis.filter((r) => r.status === col.key);
      if (colRfis.some((r) => r.id === over.id)) {
        targetStatus = col.key;
        break;
      }
    }

    if (!targetStatus || targetStatus === activeRfiData.status) return;

    updateMutation.mutate({ id: activeRfiData.id, status: targetStatus as RfiStatus });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {grouped.map(({ column, items }) => (
          <div key={column.key} id={column.key} className="flex-1 min-w-[220px]">
            <KanbanColumn column={column} rfis={items} onOpen={onOpenRfi} />
          </div>
        ))}
      </div>
      <DragOverlay>
        {activeRfi && (
          <div className="w-[200px] opacity-90 pointer-events-none rotate-2">
            <Card className={cn(
              "border-l-[3px] shadow-xl",
              activeRfi.status === "draft" && "border-l-slate-400 dark:border-l-slate-700",
              activeRfi.status === "submitted" && "border-l-info dark:border-l-info",
              activeRfi.status === "approved" && "border-l-success dark:border-l-success",
              activeRfi.status === "rejected" && "border-l-red-500 dark:border-l-red-600",
              activeRfi.status === "closed" && "border-l-zinc-400 dark:border-l-zinc-700"
            )}>
              <CardContent className="p-2 space-y-1">
                <span className="font-mono text-[9px] font-bold text-muted-foreground">{activeRfi.number}</span>
                <p className="text-[11px] font-medium leading-tight text-foreground/90">{activeRfi.subject}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
