"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Pencil, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { setAuthUser } from "@/lib/client-auth";

export default function AdminOrganizations() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.listOrganizations.useQuery({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<null | {
    id: string;
    name: string;
    status: string;
    orgScale?: string;
    partnershipType?: string;
    financeLocation?: string;
  }>(null);
  const [impersonateOrg, setImpersonateOrg] = useState<null | { id: string; name: string }>(null);
  const [reason, setReason] = useState("");

  const createMut = trpc.admin.createOrganization.useMutation({
    onSuccess: () => { utils.admin.listOrganizations.invalidate(); setCreateOpen(false); toast.success("Organization created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.admin.updateOrganization.useMutation({
    onSuccess: () => { utils.admin.listOrganizations.invalidate(); setEditOrg(null); toast.success("Organization updated"); },
    onError: (e) => toast.error(e.message),
  });
  const impersonateMut = trpc.admin.startImpersonation.useMutation({
    onSuccess: (res) => {
      // Impersonation mutates the Session row server-side; the same
      // httpOnly cookie stays valid. Just refresh the cached identity.
      if (res.user) setAuthUser(res.user);
      toast.success(`Now impersonating ${impersonateOrg?.name ?? "organization"}`);
      setImpersonateOrg(null);
      setReason("");
      router.push("/dashboard");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground">All organizations on the platform.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Organization</Button>
          </DialogTrigger>
          <DialogContent className="!max-w-4xl sm:!max-w-4xl w-[90vw] border-[var(--border)] bg-white/98 backdrop-blur-2xl p-6 shadow-2xl text-foreground rounded-2xl">
            <DialogHeader className="pb-3 border-b border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                    Create Contractor Organization
                    <span className="text-[10px] font-mono font-normal text-[var(--primary)] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      नयाँ कम्पनी दर्ता
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Provision contractor workspace and assign the primary Organization Administrator.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <CreateOrgForm mut={createMut} />
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
                  <TableHead className="text-xs">Code</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Scale / Partnership</TableHead>
                  <TableHead className="text-xs">Operating Model</TableHead>
                  <TableHead className="text-xs">Projects</TableHead>
                  <TableHead className="text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.orgs.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium text-sm text-foreground">{o.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{o.code}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "active" ? "default" : "secondary"}>{o.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-foreground/80">
                      {o.orgScale === "single_project_jv" ? "Single Dedicated Project" : "Multi-Project Firm"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="text-[var(--primary)] font-mono text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {o.financeLocation === "centralized"
                          ? "HQ Imprest + Bulk Central"
                          : o.financeLocation === "site_autonomous"
                          ? "Autonomous Site Branch"
                          : "Hybrid Site & HQ"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{o._count.projects}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Impersonate this organization"
                          onClick={() => setImpersonateOrg({ id: o.id, name: o.name })}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setEditOrg({
                              id: o.id,
                              name: o.name,
                              status: o.status,
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editOrg} onOpenChange={(o) => !o && setEditOrg(null)}>
        <DialogContent className="!max-w-3xl sm:!max-w-3xl w-[85vw] border-[var(--border)] bg-white/98 backdrop-blur-2xl p-6 shadow-2xl text-foreground rounded-2xl">
          <DialogHeader className="pb-3 border-b border-[var(--border)]">
            <DialogTitle className="text-lg font-bold tracking-tight text-foreground">Edit Organization Profile</DialogTitle>
          </DialogHeader>
          {editOrg && (
            <EditOrgForm org={editOrg} mut={updateMut} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!impersonateOrg} onOpenChange={(o) => !o && setImpersonateOrg(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Impersonate {impersonateOrg?.name}</DialogTitle>
            <DialogDescription>
              You will act as this organization. All actions are audit-logged. Provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. investigating a support ticket"
            />
          </div>
          <DialogFooter>
            <Button
              disabled={impersonateMut.isPending || !reason}
              onClick={() => impersonateOrg && impersonateMut.mutate({ organizationId: impersonateOrg.id, reason })}
            >
              {impersonateMut.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Start impersonation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateOrgForm({ mut }: { mut: ReturnType<typeof trpc.admin.createOrganization.useMutation> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [domain, setDomain] = useState("");
  const [adminName, setAdminName] = useState("");
  const [username, setUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");

  // Auto-generate domain slug when name changes if domain hasn't been manually set
  const handleNameChange = (val: string) => {
    setName(val);
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 16);
    if (!domain || domain === name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16)) {
      setDomain(slug);
    }
  };

  const fullAdminEmail = `${username.trim().toLowerCase()}@${(domain.trim() || "company").toLowerCase()}`;
  const isFormValid = name.trim() && domain.trim() && adminName.trim() && username.trim() && adminPassword.length >= 8;

  return (
    <div className="space-y-5 pt-3 font-sans text-xs">
      {/* 16:10 Landscape Proportional Grid (2 Balanced Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Left Column: Organization Entity */}
        <div className="space-y-3 bg-[#f8fbfe]/40 p-4 rounded-xl border border-[var(--input)]">
          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--input)]">
            <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">
              1. Organization Profile
            </span>
            <span className="text-[10px] text-[var(--primary)] font-mono">कम्पनी विवरण</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground/90">Company Name (कम्पनीको नाम) *</Label>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Anturam Construction Pvt. Ltd."
              className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-medium focus:border-emerald-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground/90">Workspace Domain *</Label>
              <div className="flex items-center rounded-md border border-[var(--border)] bg-card px-2.5 h-9 focus-within:border-emerald-500">
                <span className="text-muted-foreground font-mono text-xs mr-0.5">@</span>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ""))}
                  placeholder="anturam"
                  className="w-full bg-transparent text-xs text-[var(--primary)] font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground/90">Company Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. ACPL"
                className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono uppercase"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Team members will log in using <code className="text-[var(--primary)] font-mono font-bold">username@{domain || "domain"}</code>
          </p>
        </div>

        {/* Right Column: Organization Administrator Account */}
        <div className="space-y-3 bg-[#f8fbfe]/40 p-4 rounded-xl border border-[var(--input)]">
          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--input)]">
            <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">
              2. Primary Admin Login
            </span>
            <span className="text-[10px] text-info/80 font-mono">प्रशासक खाता</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground/90">Admin Full Name *</Label>
            <Input
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="e.g. Aakash Dhakal"
              className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-info/60"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground/90">Admin Login Identity *</Label>
            <div className="flex items-center rounded-md border border-[var(--border)] bg-card px-2.5 h-9 focus-within:border-info/60">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                placeholder="admin"
                className="w-1/2 bg-transparent text-xs text-foreground font-medium focus:outline-none"
              />
              <span className="text-muted-foreground font-mono text-[11px] border-l border-[var(--border)] pl-2 ml-auto">
                @{domain || "domain"}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground/90">Initial Password (८+ अक्षर) *</Label>
            <Input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-info/60"
            />
          </div>
        </div>
      </div>

      <DialogFooter className="pt-3 border-t border-[var(--border)] mt-3 flex items-center justify-between sm:justify-between">
        <div className="text-[11px] text-muted-foreground">
          Admin will sign in as <span className="text-[var(--primary)] font-mono font-bold">{fullAdminEmail}</span>
        </div>
        <Button
          disabled={mut.isPending || !isFormValid}
          onClick={() =>
            mut.mutate({
              name: name.trim(),
              code: code.trim() || undefined,
              adminName: adminName.trim(),
              adminEmail: fullAdminEmail,
              adminPassword: adminPassword,
            })
          }
          className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-6 h-9"
        >
          {mut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create Organization &amp; Admin
        </Button>
      </DialogFooter>
    </div>
  );
}

function EditOrgForm({
  org,
  mut,
}: {
  org: {
    id: string;
    name: string;
    status: string;
  };
  mut: ReturnType<typeof trpc.admin.updateOrganization.useMutation>;
}) {
  const [name, setName] = useState(org.name);
  const [status, setStatus] = useState(org.status);

  return (
    <div className="space-y-4 pt-3 font-sans text-xs">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="md:col-span-2 space-y-1.5">
          <Label className="text-xs font-semibold text-foreground/90">Company Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 text-xs bg-[#f8fbfe] border-[var(--border)] text-foreground font-medium"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground/90">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 text-xs bg-[#f8fbfe] border-[var(--border)] text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-[var(--border)] text-xs">
              <SelectItem value="active">Active (सक्रिय)</SelectItem>
              <SelectItem value="archived">Archived (संग्रहित)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter className="pt-3 border-t border-[var(--border)] mt-2">
        <Button
          disabled={mut.isPending || !name.trim()}
          onClick={() =>
            mut.mutate({
              id: org.id,
              name: name.trim(),
              status,
            })
          }
          className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-6 h-9"
        >
          {mut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save Changes
        </Button>
      </DialogFooter>
    </div>
  );
}
