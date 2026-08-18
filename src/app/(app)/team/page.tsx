"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, Plus, Loader2, KeyRound, Trash2, ShieldCheck, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  project_manager: "Project Manager",
  engineer: "Engineer",
  coordinator: "Coordinator",
  client: "Client",
  inspector: "Inspector",
};

const ROLE_COLORS: Record<string, string> = {
  project_manager: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  engineer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  coordinator: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  client: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  inspector: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};

export default function TeamPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.project.listOrgUsers.useQuery();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("engineer");

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");

  const createMut = trpc.project.createOrgUser.useMutation({
    onSuccess: () => {
      utils.project.listOrgUsers.invalidate();
      setAddOpen(false);
      setName(""); setEmail(""); setPassword(""); setRole("engineer");
      toast.success("User created");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetMut = trpc.project.resetOrgUserPassword.useMutation({
    onSuccess: () => {
      utils.project.listOrgUsers.invalidate();
      setResetUserId(null);
      setNewPassword("");
      toast.success("Password reset — user will need to log in again");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRoleMut = trpc.project.updateOrgUserRole.useMutation({
    onSuccess: () => {
      utils.project.listOrgUsers.invalidate();
      setEditUserId(null);
      toast.success("Role updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMut = trpc.project.removeOrgUser.useMutation({
    onSuccess: () => {
      utils.project.listOrgUsers.invalidate();
      toast.success("User removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const users = data?.users ?? [];

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Team Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage users within your organization.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add User</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>Create a new account for a team member in your organization.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" type="email" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Temporary Password</Label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="text" placeholder="At least 8 characters" className="h-9 text-sm" />
                <p className="text-[10px] text-muted-foreground">Share this password with the user. They can change it after logging in.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project_manager">Project Manager</SelectItem>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="coordinator">Coordinator</SelectItem>
                    <SelectItem value="client">Client (Read-only)</SelectItem>
                    <SelectItem value="inspector">Inspector</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMut.mutate({ name, email, password, role: role as any })}
                disabled={createMut.isPending || !name || !email || !password}
              >
                {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Create User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Users className="mx-auto h-10 w-10 mb-2 opacity-50" />
              No users yet. Click "Add User" to create your first team member.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Joined</TableHead>
                  <TableHead className="text-xs">Org Role</TableHead>
                  <TableHead className="text-center text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-sm">{u.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {editUserId === u.id ? (
                        <Select value={editRole} onValueChange={setEditRole}>
                          <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="project_manager">Project Manager</SelectItem>
                            <SelectItem value="engineer">Engineer</SelectItem>
                            <SelectItem value="coordinator">Coordinator</SelectItem>
                            <SelectItem value="client">Client</SelectItem>
                            <SelectItem value="inspector">Inspector</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={cn("text-[10px]", ROLE_COLORS[u.role] ?? "")}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {u.createdAt ? format(new Date(u.createdAt), "dd MMM yy") : "—"}
                    </TableCell>
                    <TableCell>
                      {u.orgRole === "org_admin" && (
                        <Badge className="text-[9px] gap-1">
                          <ShieldCheck className="h-3 w-3" /> Admin
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {editUserId === u.id ? (
                          <>
                            <Button size="sm" className="h-6 text-[10px]" onClick={() => updateRoleMut.mutate({ userId: u.id, role: editRole as any })}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditUserId(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setEditUserId(u.id); setEditRole(u.role); }}
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Change role"
                            >
                              <Users className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setResetUserId(u.id); setNewPassword(""); }}
                              className="rounded p-1 text-muted-foreground hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-950"
                              title="Reset password"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                            {u.orgRole !== "org_admin" && (
                              <button
                                onClick={() => {
                                  if (confirm(`Remove ${u.name}? They will lose access immediately.`)) {
                                    removeMut.mutate({ userId: u.id });
                                  }
                                }}
                                className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950"
                                title="Remove user"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
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

      {/* Reset password dialog */}
      <Dialog open={!!resetUserId} onOpenChange={(o) => !o && setResetUserId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for this user. They will need to log in again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">New Password</Label>
              <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="text" placeholder="At least 8 characters" className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUserId(null)}>Cancel</Button>
            <Button
              onClick={() => resetUserId && resetMut.mutate({ userId: resetUserId, newPassword })}
              disabled={resetMut.isPending || newPassword.length < 8}
            >
              {resetMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
