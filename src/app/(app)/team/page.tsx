"use client";

import { useState, useEffect } from "react";
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
  Users, Plus, Loader2, KeyRound, Trash2, ShieldCheck, Mail, Building2, Sliders, Shield, Save
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  org_admin: "Org Admin",
  member: "Member",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-emerald-500/10 text-[var(--primary)] border border-emerald-500/20",
  org_admin: "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info/80",
  member: "bg-muted text-foreground/80 dark:bg-[var(--navy-mid)] dark:text-foreground/80",
};

export default function TeamPage() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"members" | "organization">("members");
  const usersQuery = trpc.project.listOrgUsers.useInfiniteQuery(
    {},
    { getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined) }
  );
  const isLoading = usersQuery.isLoading;
  const { data: orgData, isLoading: orgLoading } = trpc.project.getOrgProfile.useQuery();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");

  // Organization configuration state
  const [orgScale, setOrgScale] = useState<string>("multi_project");
  const [partnershipType, setPartnershipType] = useState<string>("sole");
  const [operatingMethod, setOperatingMethod] = useState<string>("owner_led");
  const [pettyCashLimit, setPettyCashLimit] = useState<number>(50000);

  // Sync state when orgData loads
  useEffect(() => {
    if (orgData?.org) {
      setOrgScale(orgData.org.orgScale || "multi_project");
      setPartnershipType(orgData.org.partnershipType || "sole");
      setOperatingMethod(orgData.org.operatingMethod || "owner_led");
      setPettyCashLimit(orgData.org.sitePettyCashLimit ?? 50000);
    }
  }, [orgData]);

  const updateOrgMut = trpc.project.updateOrgProfile.useMutation({
    onSuccess: () => {
      utils.project.getOrgProfile.invalidate();
      toast.success("Organization operating model and configuration updated!");
    },
    onError: (e) => toast.error(e.message),
  });

  const createMut = trpc.project.createOrgUser.useMutation({
    onSuccess: () => {
      utils.project.listOrgUsers.invalidate();
      setAddOpen(false);
      setName(""); setEmail(""); setPassword("");
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

  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  const removeMut = trpc.project.removeOrgUser.useMutation({
    onSuccess: () => {
      utils.project.listOrgUsers.invalidate();
      toast.success("User removed");
      setRemoveTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const users = usersQuery.data ? usersQuery.data.pages.flatMap((p) => p.users) : [];

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Team &amp; Workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage organization members, workspace operating model, and contractor delegation rules.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <TabsList className="bg-muted p-1 rounded-xl h-10 border-none shadow-none flex w-fit">
          <TabsTrigger value="members" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <Users className="h-4 w-4 text-info/80" /> Team Members ({users.length})
          </TabsTrigger>
          <TabsTrigger value="organization" className="gap-2 text-xs font-semibold px-4 py-1.5">
            <Building2 className="h-4 w-4 text-[var(--primary)]" /> Organization Configuration &amp; Operating Model
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <div className="flex justify-end">
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
                    <Label className="text-xs">Email / Username</Label>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Temporary Password</Label>
                    <Input value={password} onChange={(e) => setPassword(e.target.value)} type="text" placeholder="At least 8 characters" className="h-9 text-sm" />
                    <p className="text-[10px] text-muted-foreground">Share this password with the user. They can change it after logging in.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => createMut.mutate({ name, email, password })}
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
                <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Email / Username</TableHead>
                      <TableHead className="text-xs">Role</TableHead>
                      <TableHead className="text-xs">Joined</TableHead>
                      <TableHead className="text-xs">Org Role</TableHead>
                      <TableHead className="text-center text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium text-xs text-foreground">{u.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{u.email}</TableCell>
                        <TableCell>
                          {editUserId === u.id ? (
                            <Select value={editRole} onValueChange={setEditRole}>
                              <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">Owner</SelectItem>
                                <SelectItem value="org_admin">Org Admin</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge className={cn("text-[10px] capitalize", ROLE_COLORS[u.orgRole] || "bg-muted")}>
                              {ROLE_LABELS[u.orgRole] || u.orgRole}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">
                          {u.createdAt ? format(new Date(u.createdAt), "dd MMM yy") : "—"}
                        </TableCell>
                        <TableCell>
                          {u.orgRole === "org_admin" && (
                            <Badge className="text-[9px] gap-1 bg-emerald-500/10 text-[var(--primary)] border border-emerald-500/20">
                              <ShieldCheck className="h-3 w-3" /> Admin
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {editUserId === u.id ? (
                              <>
                                <Button size="sm" className="h-6 text-[10px]" onClick={() => updateRoleMut.mutate({ userId: u.id, orgRole: editRole as any })}>
                                  Save
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditUserId(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => { setEditUserId(u.id); setEditRole(u.orgRole); }}
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
                                    onClick={() => setRemoveTarget({ id: u.id, name: u.name })}
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
                {usersQuery.hasNextPage && (
                  <div className="flex justify-center border-t border-border/60 pt-3">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => usersQuery.fetchNextPage()} disabled={usersQuery.isFetchingNextPage}>
                      {usersQuery.isFetchingNextPage ? "Loading…" : "Load more members"}
                    </Button>
                  </div>
                )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization Configuration & Operating Model Tab */}
        <TabsContent value="organization" className="space-y-4">
          <div className="bg-[#f8fbfe]/40 p-6 rounded-2xl border border-[var(--input)] space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[var(--primary)]" /> Organization Type &amp; Operating Model
                </h2>
                <p className="text-xs text-muted-foreground">
                  Configure contractor scale, joint venture structure, and financial site delegation authority.
                </p>
              </div>
              <Button
                onClick={() =>
                  updateOrgMut.mutate({
                    orgScale: orgScale as any,
                    partnershipType: partnershipType as any,
                    operatingMethod: operatingMethod as any,
                    sitePettyCashLimit: pettyCashLimit,
                  })
                }
                disabled={updateOrgMut.isPending}
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs gap-1.5"
              >
                {updateOrgMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Workspace Configuration
              </Button>
            </div>

            {/* 16:10 Wide Responsive Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* 1. Organization Scale */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground/90">Organization Scale *</Label>
                <div className="space-y-2">
                  <div
                    onClick={() => setOrgScale("multi_project")}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all",
                      orgScale === "multi_project"
                        ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                        : "border-[var(--border)] bg-card text-muted-foreground hover:border-[var(--primary)]"
                    )}
                  >
                    <div className="font-semibold text-xs text-foreground">🏢 Multi-Project Firm</div>
                    <p className="text-[11px] text-muted-foreground mt-1">Company runs multiple ongoing sites across different districts.</p>
                  </div>

                  <div
                    onClick={() => setOrgScale("single_project_jv")}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all",
                      orgScale === "single_project_jv"
                        ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                        : "border-[var(--border)] bg-card text-muted-foreground hover:border-[var(--primary)]"
                    )}
                  >
                    <div className="font-semibold text-xs text-foreground">🤝 Single Dedicated Project JV</div>
                    <p className="text-[11px] text-muted-foreground mt-1">Dedicated entity created for a single joint venture contract.</p>
                  </div>
                </div>
              </div>

              {/* 2. Partnership Model */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground/90">Contractor Partnership Model *</Label>
                <div className="space-y-2">
                  <div
                    onClick={() => setPartnershipType("sole")}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all",
                      partnershipType === "sole"
                        ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                        : "border-[var(--border)] bg-card text-muted-foreground hover:border-[var(--primary)]"
                    )}
                  >
                    <div className="font-semibold text-xs text-foreground">👤 Sole Contractor</div>
                    <p className="text-[11px] text-muted-foreground mt-1">100% owned &amp; operated by this organization.</p>
                  </div>

                  <div
                    onClick={() => setPartnershipType("lead_partner_jv")}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all",
                      partnershipType === "lead_partner_jv"
                        ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                        : "border-[var(--border)] bg-card text-muted-foreground hover:border-[var(--primary)]"
                    )}
                  >
                    <div className="font-semibold text-xs text-foreground">👑 Lead Managing Partner (JV)</div>
                    <p className="text-[11px] text-muted-foreground mt-1">Manages execution, billing, and distributes partner shares.</p>
                  </div>

                  <div
                    onClick={() => setPartnershipType("joint_jv")}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all",
                      partnershipType === "joint_jv"
                        ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                        : "border-[var(--border)] bg-card text-muted-foreground hover:border-[var(--primary)]"
                    )}
                  >
                    <div className="font-semibold text-xs text-foreground">⚖️ Jointly Operated JV</div>
                    <p className="text-[11px] text-muted-foreground mt-1">Equal partner governance and joint approvals.</p>
                  </div>
                </div>
              </div>

              {/* 3. Operating Method (ADR-0004 — workflow template, not a size class) */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground/90">Operating Method *</Label>
                <div className="space-y-2">
                  <div
                    onClick={() => setOperatingMethod("owner_led")}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all",
                      operatingMethod === "owner_led"
                        ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                        : "border-[var(--border)] bg-card text-muted-foreground hover:border-[var(--primary)]"
                    )}
                  >
                    <div className="font-semibold text-xs text-foreground">🔧 Owner-Led</div>
                    <p className="text-[11px] text-muted-foreground mt-1">Direct purchases &amp; expenses only — no requisitions, POs, quotes or stores exist server-side.</p>
                  </div>

                  <div
                    onClick={() => setOperatingMethod("crew_led")}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all",
                      operatingMethod === "crew_led"
                        ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                        : "border-[var(--border)] bg-card text-muted-foreground hover:border-[var(--primary)]"
                    )}
                  >
                    <div className="font-semibold text-xs text-foreground">👥 Crew-Led</div>
                    <p className="text-[11px] text-muted-foreground mt-1">Quote comparisons and basic stock tracking; POs and gate register stay off.</p>
                  </div>

                  <div
                    onClick={() => setOperatingMethod("delegated")}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all",
                      operatingMethod === "delegated"
                        ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                        : "border-[var(--border)] bg-card text-muted-foreground hover:border-[var(--primary)]"
                    )}
                  >
                    <div className="font-semibold text-xs text-foreground">🏢 Delegated</div>
                    <p className="text-[11px] text-muted-foreground mt-1">Full procurement chain, controlled stores, gate register and delegated finance review.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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

      {/* Confirmation Modal for Removing Organization User */}
      {removeTarget && (
        <ConfirmDialog
          open={Boolean(removeTarget)}
          onOpenChange={(open) => {
            if (!open) setRemoveTarget(null);
          }}
          title="Remove Organization Member?"
          description={`Are you sure you want to remove ${removeTarget.name}? They will immediately lose access to all projects, financial records, and workspace tools.`}
          variant="destructive"
          confirmLabel="Remove Member"
          isLoading={removeMut.isPending}
          onConfirm={async () => {
            await removeMut.mutateAsync({ userId: removeTarget.id });
          }}
        />
      )}
    </div>
  );
}
