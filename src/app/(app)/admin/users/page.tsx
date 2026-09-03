"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Pencil, Trash2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const ROLES = ["owner", "org_admin", "member"] as const;
const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", org_admin: "Org Admin", member: "Member",
};

export default function AdminUsers() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const { data, isLoading } = trpc.admin.listUsers.useQuery({ search: search || undefined, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE });
  const orgs = trpc.admin.listOrganizations.useQuery({ take: 200 });
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<null | any>(null);
  const [confirmAction, setConfirmAction] = useState<{ userId: string; userName: string; action: "superadmin" | "deactivate" } | null>(null);

  const createMut = trpc.admin.createUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setCreateOpen(false); toast.success("User created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.admin.updateUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setEditUser(null); toast.success("User updated"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">All users across every organization.</p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search users…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-64"
          />
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New User</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
              <CreateUserForm orgs={orgs.data?.orgs ?? []} mut={createMut} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Org</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Org Role</TableHead>
                  <TableHead className="text-xs">Superadmin</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-sm">{u.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-xs">{u.organization?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{ROLE_LABELS[u.orgRole] ?? u.orgRole}</Badge></TableCell>
                    <TableCell className="text-xs">{u.orgRole}</TableCell>
                    <TableCell>
                      {u.isSuperAdmin && <Badge className="text-[9px] gap-1"><ShieldCheck className="h-3 w-3" /> Yes</Badge>}
                    </TableCell>
                    <TableCell>
                      {u.deactivatedAt
                        ? <Badge variant="destructive" className="text-[9px]">Deactivated</Badge>
                        : <Badge variant="secondary" className="text-[9px]">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditUser(u)} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmAction({ userId: u.id, userName: u.name, action: "superadmin" })}
                          className="rounded p-1 text-muted-foreground hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-950"
                          title={u.isSuperAdmin ? "Revoke superadmin" : "Make superadmin"}
                        >
                          {u.isSuperAdmin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        </button>
                        {!u.deactivatedAt && (
                          <button
                            onClick={() => setConfirmAction({ userId: u.id, userName: u.name, action: "deactivate" })}
                            className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950"
                            title="Deactivate"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {u.deactivatedAt && (
                          <button
                            onClick={() => updateMut.mutate({ id: u.id, deactivatedAt: false })}
                            className="rounded p-1 text-muted-foreground hover:bg-success/15 hover:text-success dark:hover:bg-success"
                            title="Reactivate"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data?.total && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * PAGE_SIZE >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {editUser && (
            <EditUserForm user={editUser} orgs={orgs.data?.orgs ?? []} mut={updateMut}
              onClose={() => setEditUser(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.action === "superadmin" ? "Toggle Superadmin" : "Deactivate User"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.action === "superadmin"
                ? `This will revoke full platform access for ${confirmAction?.userName}. They will lose the ability to manage organizations and view all data.`
                : `This will deactivate ${confirmAction?.userName}'s account. They will be unable to log in.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              variant={confirmAction?.action === "superadmin" ? "outline" : "destructive"}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.action === "superadmin") {
                  const user = data?.users?.find((u: any) => u.id === confirmAction.userId);
                  updateMut.mutate({ id: confirmAction.userId, isSuperAdmin: !user?.isSuperAdmin });
                } else {
                  updateMut.mutate({ id: confirmAction.userId, deactivatedAt: true });
                }
                setConfirmAction(null);
              }}
            >
              {confirmAction?.action === "superadmin" ? "Confirm" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateUserForm({ orgs, mut }: { orgs: any[]; mut: any }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("engineer");
  const [organizationId, setOrganizationId] = useState<string>("none");
  const [orgRole, setOrgRole] = useState("member");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Full Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Temporary Password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Organization</Label>
        <Select value={organizationId} onValueChange={setOrganizationId}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No organization (platform)</SelectItem>
            {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Org Role</Label>
        <Select value={orgRole} onValueChange={setOrgRole}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="org_admin">Org Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.target.checked)} />
        Platform superadmin
      </label>
      <DialogFooter>
        <Button
          disabled={mut.isPending || !name || !email || password.length < 8}
          onClick={() => mut.mutate({
            name, email, password, role: role as any,
            organizationId: organizationId === "none" ? null : organizationId,
            orgRole: orgRole as any, isSuperAdmin,
          })}
        >
          {mut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Create
        </Button>
      </DialogFooter>
    </div>
  );
}

function EditUserForm({ user, orgs, mut, onClose }: { user: any; orgs: any[]; mut: any; onClose: () => void }) {
  const [role, setRole] = useState(user.orgRole);
  const [orgRole, setOrgRole] = useState(user.orgRole);
  const [organizationId, setOrganizationId] = useState(user.organizationId ?? "none");
  const [isSuperAdmin, setIsSuperAdmin] = useState(!!user.isSuperAdmin);

  return (
    <div className="space-y-3 py-2">
      <div className="text-xs text-muted-foreground">{user.email}</div>
      <div className="space-y-1.5">
        <Label className="text-xs">Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Org Role</Label>
        <Select value={orgRole} onValueChange={setOrgRole}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="org_admin">Org Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Organization</Label>
        <Select value={organizationId} onValueChange={setOrganizationId}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No organization (platform)</SelectItem>
            {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.target.checked)} />
        Platform superadmin
      </label>
      <DialogFooter>
        <Button
          disabled={mut.isPending}
          onClick={() => {
            mut.mutate({
              id: user.id,
              role: role as any,
              orgRole: orgRole as any,
              organizationId: organizationId === "none" ? null : organizationId,
              isSuperAdmin,
            });
            onClose();
          }}
        >
          {mut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
        </Button>
      </DialogFooter>
    </div>
  );
}
