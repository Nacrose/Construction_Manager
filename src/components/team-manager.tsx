"use client";

import { trpc } from "@/lib/trpc-client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {UserPlus, Trash2, Crown, Loader2} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type _Member = {
  id: string;
  role: string;
  user: { id: string; name: string; email: string; role: string };
};

const ROLES = ["project_manager", "engineer", "coordinator", "client", "inspector"] as const;

const ROLE_STYLES: Record<string, string> = {
  project_manager: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  engineer: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  coordinator: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  client: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  inspector: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function TeamManager({
  projectId,
  initialMembers,
  canManage,
}: {
  projectId: string;
  initialMembers: any[];
  canManage: boolean;
}) {
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = trpc.project.listMembers.useQuery(
    { projectId, limit: 500 }, // deliberate max page: full roster for count + role editing
    { initialData: { members: initialMembers, hasMore: false, nextCursor: null } }
  );

  const removeMutation = trpc.project.removeMember.useMutation({
    onSuccess: () => {
      utils.project.listMembers.invalidate({ projectId });
      utils.project.get.invalidate({ id: projectId });
      toast.success("Member removed");
      setRemoveTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const roleMutation = trpc.project.updateMember.useMutation({
    onSuccess: () => {
      utils.project.listMembers.invalidate({ projectId });
      toast.success("Role updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const members = data?.members ?? initialMembers;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{members.length} members</p>
        {canManage && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <UserPlus className="mr-1 h-3 w-3" /> Invite
              </Button>
            </DialogTrigger>
            <AddMemberDialog projectId={projectId} onDone={() => setAddOpen(false)} />
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-md border p-2"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-medium text-white">
                  {m.user.name
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canManage ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) => roleMutation.mutate({ projectId, memberId: m.id, role: v as any })}
                  >
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize text-xs">
                          {r === "project_manager" && <Crown className="mr-1 inline h-3 w-3" />}
                          {r.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge
                    variant="secondary"
                    className={`capitalize text-xs ${ROLE_STYLES[m.role] ?? ""}`}
                  >
                    {m.role.replace("_", " ")}
                  </Badge>
                )}
                {canManage && (
                  <button
                    onClick={() => setRemoveTarget({ id: m.id, name: m.user.name })}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove member"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Confirmation Modal for Removing Team Member */}
      {removeTarget && (
        <ConfirmDialog
          open={Boolean(removeTarget)}
          onOpenChange={(open) => {
            if (!open) setRemoveTarget(null);
          }}
          title="Remove Team Member?"
          description={`Are you sure you want to remove ${removeTarget.name} from this project? They will lose access to project documents and records.`}
          variant="destructive"
          confirmLabel="Remove Member"
          isLoading={removeMutation.isPending}
          onConfirm={async () => {
            await removeMutation.mutateAsync({ projectId, memberId: removeTarget.id });
          }}
        />
      )}
    </div>
  );
}

function AddMemberDialog({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"project_manager" | "engineer" | "coordinator" | "client" | "inspector">("engineer");

  const mutation = trpc.project.addMember.useMutation({
    onSuccess: () => {
      utils.project.listMembers.invalidate({ projectId });
      utils.project.get.invalidate({ id: projectId });
      toast.success("Member added");
      onDone();
      setEmail(""); setName("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Invite team member</DialogTitle>
        <DialogDescription>
          Add a user to this project by email. If they don&apos;t have an account, one will be created.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ projectId, email, name: name || undefined, role }); }} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Email *</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="colleague@company.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Name (optional)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v: any) => setRole(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add member
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
