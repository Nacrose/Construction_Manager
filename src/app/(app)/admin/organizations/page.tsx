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
import { getToken, setAuth } from "@/lib/client-auth";

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
      const token = getToken();
      if (token && res.user) setAuth(token, res.user);
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
          <DialogContent className="!max-w-5xl sm:!max-w-5xl md:!max-w-6xl w-[95vw] max-h-[85vh] overflow-y-auto border-white/10 bg-[#0b0f17]/98 backdrop-blur-2xl p-6 shadow-2xl text-white rounded-2xl">
            <DialogHeader className="pb-3 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                    Create Organization
                    <span className="text-[10px] font-mono font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      नयाँ कम्पनी दर्ता
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-gray-400 mt-0.5">
                    Create the contractor company workspace. Roles and operating structure are configured inside the organization.
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
                    <TableCell className="font-medium text-sm text-white">{o.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{o.code}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "active" ? "default" : "secondary"}>{o.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-300">
                      {o.orgScale === "single_project_jv" ? "Single Dedicated Project" : "Multi-Project Firm"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="text-emerald-400 font-mono text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
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
                              orgScale: o.orgScale,
                              partnershipType: o.partnershipType,
                              financeLocation: o.financeLocation,
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
        <DialogContent className="!max-w-5xl sm:!max-w-5xl md:!max-w-6xl w-[95vw] max-h-[85vh] overflow-y-auto border-white/10 bg-[#0b0f17]/98 backdrop-blur-2xl p-6 shadow-2xl text-white rounded-2xl">
          <DialogHeader className="pb-3 border-b border-white/10">
            <DialogTitle className="text-lg font-bold tracking-tight text-white">Edit Organization Profile</DialogTitle>
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

  return (
    <div className="space-y-4 pt-3 font-sans text-xs">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="md:col-span-2 space-y-1.5">
          <Label className="text-xs font-semibold text-gray-200">Company Name (कम्पनीको नाम) *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Anturam Construction Pvt. Ltd."
            className="h-10 text-xs bg-[#121820] border-white/10 text-white font-medium"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-200">Company Code (ऐच्छिक)</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Auto-generated"
            className="h-10 text-xs bg-[#121820] border-white/10 text-white font-mono uppercase"
          />
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        ℹ️ All contractor operating models, project structures, partner sharing, and member roles are configured directly inside the organization dashboard.
      </p>

      <DialogFooter className="pt-3 border-t border-white/10 mt-2 flex items-center justify-between sm:justify-between">
        <div className="text-[10px] text-gray-500 font-mono">
          Ready to provision workspace
        </div>
        <Button
          disabled={mut.isPending || !name.trim()}
          onClick={() =>
            mut.mutate({
              name: name.trim(),
              code: code.trim() || undefined,
            })
          }
          className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-6 h-9"
        >
          {mut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create Organization
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
          <Label className="text-xs font-semibold text-gray-200">Company Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 text-xs bg-[#121820] border-white/10 text-white font-medium"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-200">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 text-xs bg-[#121820] border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0f141c] border-white/10 text-xs">
              <SelectItem value="active">Active (सक्रिय)</SelectItem>
              <SelectItem value="archived">Archived (संग्रहित)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter className="pt-3 border-t border-white/10 mt-2">
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


