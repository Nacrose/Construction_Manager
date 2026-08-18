"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, ChevronRight, ChevronDown, UserPlus, X, Loader2,
  ChevronsDownUp, ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  engineer: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  mason: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  labor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  operator: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  supervisor: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  staff: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

type RoleNode = {
  id: string;
  name: string;
  category: string;
  chainageFrom: number | null;
  chainageTo: number | null;
  headcount: number;
  dailyWage: number;
  notes: string | null;
  children: RoleNode[];
  assignments: Array<{
    id: string;
    startDate: Date;
    endDate: Date | null;
    staff: { id: string; name: string; designation: string | null; category: string | null; dailyWage: number; status: string };
  }>;
};

export function StaffRolesTab({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.staffRole.list.useQuery({ projectId });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<string | null>(null);

  const { data: staffData } = trpc.hr.list.useQuery({ projectId, tab: "staff" });

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Collect all role IDs that have children (i.e., are expandable) */
  function collectExpandableIds(roles: RoleNode[]): Set<string> {
    const ids = new Set<string>();
    const walk = (nodes: RoleNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) ids.add(n.id);
        walk(n.children);
      }
    };
    walk(roles);
    return ids;
  }

  function expandAll() {
    const rolesTyped = (roles as unknown as RoleNode[]);
    setExpanded(collectExpandableIds(rolesTyped));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  const deleteMutation = trpc.staffRole.delete.useMutation({
    onSuccess: () => {
      utils.staffRole.list.invalidate({ projectId });
      toast.success("Role deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const assignMutation = trpc.staffRole.assignStaff.useMutation({
    onSuccess: () => {
      utils.staffRole.list.invalidate({ projectId });
      toast.success("Staff assigned to role");
      setAssignOpen(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const unassignMutation = trpc.staffRole.unassignStaff.useMutation({
    onSuccess: () => {
      utils.staffRole.list.invalidate({ projectId });
      toast.success("Staff unassigned from role");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64" />;

  const roles = data?.roles ?? [];
  const staff = staffData?.staff ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={expandAll} className="h-7 text-xs" title="Expand all">
            <ChevronsUpDown className="mr-1 h-3 w-3" /> Expand All
          </Button>
          <Button size="sm" variant="ghost" onClick={collapseAll} className="h-7 text-xs" title="Collapse all">
            <ChevronsDownUp className="mr-1 h-3 w-3" /> Collapse All
          </Button>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-8 text-xs">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Role
          </Button>
        )}
      </div>

      {roles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm text-muted-foreground">No staff roles defined yet.</p>
          <p className="text-xs text-muted-foreground">
            Define role hierarchy (e.g., "Engineer 0+000-0+5000", "Mason Team A") to assign to planning tasks.
          </p>
          {canWrite && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="mt-2 h-8 text-xs">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create First Role
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-0">
          {roles.map((role) => (
            <RoleNodeView
              key={role.id}
              role={role as unknown as RoleNode}
              expanded={expanded}
              onToggle={toggle}
              canWrite={canWrite}
              projectId={projectId}
              staff={staff as any[]}
              onDelete={(id) => deleteMutation.mutate({ roleId: id })}
              onAssign={(roleId) => setAssignOpen(roleId)}
              onUnassign={(assignmentId) => unassignMutation.mutate({ assignmentId })}
              assignOpen={assignOpen}
              onAssignSubmit={(roleId, staffId) => assignMutation.mutate({ staffRoleId: roleId, staffId })}
              isAssigning={assignMutation.isPending}
              depth={0}
              isLast={true}
            />
          ))}
        </div>
      )}

      <AddRoleDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        parentRoles={roles as any[]}
      />
    </div>
  );
}

function RoleNodeView({
  role,
  expanded,
  onToggle,
  canWrite,
  projectId,
  staff,
  onDelete,
  onAssign,
  onUnassign,
  assignOpen,
  onAssignSubmit,
  isAssigning,
  depth,
  isLast,
}: {
  role: RoleNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  canWrite: boolean;
  projectId: string;
  staff: Array<{ id: string; name: string; designation: string | null; category: string | null }>;
  onDelete: (id: string) => void;
  onAssign: (roleId: string) => void;
  onUnassign: (assignmentId: string) => void;
  assignOpen: string | null;
  onAssignSubmit: (roleId: string, staffId: string) => void;
  isAssigning: boolean;
  depth: number;
  isLast: boolean;
}) {
  const isExpanded = expanded.has(role.id);
  const hasChildren = role.children.length > 0;
  const currentAssignments = role.assignments.filter((a) => a.endDate === null);
  const isUnderstaffed = currentAssignments.length < role.headcount;

  return (
    <div>
      {/* Tree row with connector lines */}
      <div className="flex items-stretch">
        {/* Tree connector lines — one per ancestor depth level */}
        {Array.from({ length: depth }).map((_, i) => (
          <div key={i} className="w-6 shrink-0 flex justify-center">
            <div
              className="w-px bg-border"
              style={{ height: "100%" }}
            />
          </div>
        ))}

        {/* L-connector for this node (if not root) */}
        {depth > 0 && (
          <div className="w-6 shrink-0 relative">
            {/* Horizontal line from vertical guide to this node */}
            <div className="absolute top-1/2 left-0 w-full h-px bg-border" />
            {/* Vertical line: full height if not last child, half height if last (└ vs ├) */}
            <div
              className="absolute top-0 left-0 w-px bg-border"
              style={{ height: isLast ? "50%" : "100%" }}
            />
          </div>
        )}

        {/* Role card */}
        <div
          className={cn(
            "flex flex-1 items-center gap-2 rounded-md border border-border/40 px-2 py-1.5 hover:bg-muted/20 transition",
            isUnderstaffed && "border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10"
          )}
        >
        {/* Expand/collapse */}
        {hasChildren ? (
          <button onClick={() => onToggle(role.id)} className="rounded p-0.5 text-muted-foreground hover:bg-muted shrink-0">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-5 shrink-0 flex items-center justify-center">
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
          </span>
        )}

        {/* Role name */}
        <span className="text-sm font-medium truncate">{role.name}</span>

        {/* Category badge */}
        <Badge variant="secondary" className={cn("text-[10px] capitalize shrink-0", CATEGORY_COLORS[role.category] ?? "")}>
          {role.category}
        </Badge>

        {/* Chainage range */}
        {role.chainageFrom !== null && role.chainageTo !== null && (
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
            {role.chainageFrom}+ — {role.chainageTo}+
          </span>
        )}

        {/* Headcount + assignments */}
        <span className={cn("text-[10px] shrink-0", isUnderstaffed ? "text-amber-600 font-medium" : "text-muted-foreground")}>
          {currentAssignments.length}/{role.headcount} filled
        </span>

        {/* Collapsed child count badge */}
        {hasChildren && !isExpanded && (
          <Badge variant="outline" className="text-[9px] shrink-0 text-muted-foreground">
            {role.children.length} {role.children.length === 1 ? "child" : "children"}
          </Badge>
        )}

        {/* Current assignees */}
        {currentAssignments.length > 0 && (
          <div className="flex items-center gap-1">
            {currentAssignments.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {a.staff.name}
                {canWrite && (
                  <button
                    onClick={() => onUnassign(a.id)}
                    className="hover:opacity-70"
                    title={`Unassign ${a.staff.name}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Spacer to push actions to the right */}
        <span className="ml-auto" />

        {/* Actions */}
        {canWrite && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => onAssign(role.id)}
              className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              title="Assign staff"
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete role "${role.name}"? This also deletes child roles and assignments.`)) {
                  onDelete(role.id);
                }
              }}
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Delete role"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Assign staff dialog */}
      {assignOpen === role.id && (
        <AssignStaffDialog
          open={true}
          onOpenChange={() => onAssign(null as any)}
          roleName={role.name}
          staff={staff}
          onAssign={(staffId) => onAssignSubmit(role.id, staffId)}
          isAssigning={isAssigning}
        />
      )}

      {/* Children — tree continues with connector lines */}
      {hasChildren && isExpanded && (
        <div className="space-y-0">
          {role.children.map((child, idx) => (
            <RoleNodeView
              key={child.id}
              role={child}
              expanded={expanded}
              onToggle={onToggle}
              canWrite={canWrite}
              projectId={projectId}
              staff={staff}
              onDelete={onDelete}
              onAssign={onAssign}
              onUnassign={onUnassign}
              assignOpen={assignOpen}
              onAssignSubmit={onAssignSubmit}
              isAssigning={isAssigning}
              depth={depth + 1}
              isLast={idx === role.children.length - 1}
            />
          ))}
        </div>
      )}

      {/* Assignment history (when expanded via a separate toggle?) */}
    </div>
  );
}

function AssignStaffDialog({
  open,
  onOpenChange,
  roleName,
  staff,
  onAssign,
  isAssigning,
}: {
  open: boolean;
  onOpenChange: () => void;
  roleName: string;
  staff: Array<{ id: string; name: string; designation: string | null; category: string | null }>;
  onAssign: (staffId: string) => void;
  isAssigning: boolean;
}) {
  const [selectedStaffId, setSelectedStaffId] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Staff to "{roleName}"</DialogTitle>
          <DialogDescription>
            Select a staff member to fill this role. Any current assignment will be ended (preserved in history).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select staff member…" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}{s.designation ? ` — ${s.designation}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onOpenChange} disabled={isAssigning}>Cancel</Button>
          <Button
            onClick={() => selectedStaffId && onAssign(selectedStaffId)}
            disabled={!selectedStaffId || isAssigning}
            className="bg-navy-gradient text-white border-0"
          >
            {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddRoleDialog({
  open,
  onOpenChange,
  projectId,
  parentRoles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  parentRoles: Array<{ id: string; name: string; children: any[] }>;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("staff");
  const [parentId, setParentId] = useState("");
  const [chainageFrom, setChainageFrom] = useState("");
  const [chainageTo, setChainageTo] = useState("");
  const [headcount, setHeadcount] = useState("1");

  const createMutation = trpc.staffRole.create.useMutation({
    onSuccess: () => {
      utils.staffRole.list.invalidate({ projectId });
      toast.success("Role created");
      onOpenChange(false);
      setName(""); setCategory("staff"); setParentId(""); setChainageFrom(""); setChainageTo(""); setHeadcount("1");
    },
    onError: (e) => toast.error(e.message),
  });

  // Flatten parent roles for dropdown (including children)
  const flatRoles: Array<{ id: string; name: string; depth: number }> = [];
  function flatten(roles: any[], depth: number) {
    for (const r of roles) {
      flatRoles.push({ id: r.id, name: r.name, depth });
      if (r.children?.length) flatten(r.children, depth + 1);
    }
  }
  flatten(parentRoles, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Staff Role</DialogTitle>
          <DialogDescription>
            Define a role for the planning schedule (e.g., "Engineer 0+000-0+5000").
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate({
              projectId,
              parentId: parentId || undefined,
              name: name.trim(),
              category: category as any,
              chainageFrom: chainageFrom ? parseFloat(chainageFrom) : undefined,
              chainageTo: chainageTo ? parseFloat(chainageTo) : undefined,
              headcount: parseInt(headcount) || 1,
            });
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label className="text-xs">Role Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineer 0+000-0+5000" className="h-9" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="engineer">Engineer</option>
                <option value="mason">Mason</option>
                <option value="labor">Labor</option>
                <option value="operator">Operator</option>
                <option value="supervisor">Supervisor</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parent Role</Label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Top level —</option>
                {flatRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {"  ".repeat(r.depth)}{r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Chainage From (m)</Label>
              <Input value={chainageFrom} onChange={(e) => setChainageFrom(e.target.value)} type="text" inputMode="decimal" placeholder="0" className="h-9 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Chainage To (m)</Label>
              <Input value={chainageTo} onChange={(e) => setChainageTo(e.target.value)} type="text" inputMode="decimal" placeholder="5000" className="h-9 font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Headcount</Label>
            <Input value={headcount} onChange={(e) => setHeadcount(e.target.value)} type="text" inputMode="numeric" placeholder="1" className="h-9 font-mono" />
            <p className="text-[10px] text-muted-foreground">
              Wages are derived from the project's cost rate settings or the assigned staff's daily wage.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending} className="bg-navy-gradient text-white border-0">
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
