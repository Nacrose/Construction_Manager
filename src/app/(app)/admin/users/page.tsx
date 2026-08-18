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

const ROLES = ["project_manager", "engineer", "coordinator", "client", "inspector"] as const;
const ROLE_LABELS: Record<string, string> = {
  project_manager: "Project Manager", engineer: "Engineer", coordinator: "Coordinator",
  client: "Client", inspector: "Inspector",
};

export default function AdminUsers() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.listUsers.useQuery({});
  const orgs = trpc.admin.listOrganizations.useQuery({ take: 200 });
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<null | any>(null);

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
                    <TableCell><Badge variant="outline" className="text-[10px]">{ROLE_LABELS[u.role] ?? u.role}</Badge></TableCell>
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
                          onClick={() => updateMut.mutate({ id: u.id, isSuperAdmin: !u.isSuperAdmin })}
                          className="rounded p-1 text-muted-foreground hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-950"
                          title={u.isSuperAdmin ? "Revoke superadmin" : "Make superadmin"}
                        >
                          {u.isSuperAdmin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        </button>
                        {!u.deactivatedAt && (
                          <button
                            onClick={() => { if (confirm(`Deactivate ${u.name}?`)) updateMut.mutate({ id: u.id, deactivatedAt: true }); }}
                            className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950"
                            title="Deactivate"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {u.deactivatedAt && (
                          <button
                            onClick={() => updateMut.mutate({ id: u.id, deactivatedAt: false })}
                            className="rounded p-1 text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-950"
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

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {editUser && (
            <EditUserForm user={editUser} orgs={orgs.data?.orgs ?? []} mut={updateMut}
              onClose={() => setEditUser(null)} />
          )}
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
        <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars" />
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
  const [role, setRole] = useState(user.role);
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
