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
  const [editOrg, setEditOrg] = useState<null | { id: string; name: string; status: string }>(null);
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
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>Optionally bootstrap an initial org-admin account.</DialogDescription>
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
                  <TableHead className="text-xs">Members</TableHead>
                  <TableHead className="text-xs">Projects</TableHead>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.orgs.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium text-sm">{o.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{o.code}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "active" ? "default" : "secondary"}>{o.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{o._count.users}</TableCell>
                    <TableCell className="text-sm">{o._count.projects}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {format(new Date(o.createdAt), "dd MMM yy")}
                    </TableCell>
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
                        <Button size="sm" variant="ghost" onClick={() => setEditOrg({ id: o.id, name: o.name, status: o.status })}>
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
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Edit Organization</DialogTitle></DialogHeader>
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
          <div className="space-y-1.5 py-2">
            <Label className="text-xs">Reason</Label>
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
  const [status, setStatus] = useState("active");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Organization Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Construction" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Code (optional)</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Auto from name" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Status</Label>
        <Input value={status} onChange={(e) => setStatus(e.target.value)} />
      </div>
      <div className="my-2 border-t pt-2 text-xs font-medium text-muted-foreground">Initial Org Admin (optional)</div>
      <div className="space-y-1.5">
        <Label className="text-xs">Admin Name</Label>
        <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Admin Email</Label>
        <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Admin Password</Label>
        <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Min 8 chars" />
      </div>
      <DialogFooter>
        <Button
          disabled={mut.isPending || !name}
          onClick={() => mut.mutate({ name, code: code || undefined, status, adminName: adminName || undefined, adminEmail: adminEmail || undefined, adminPassword: adminPassword || undefined })}
        >
          {mut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Create
        </Button>
      </DialogFooter>
    </div>
  );
}

function EditOrgForm({ org, mut }: { org: { id: string; name: string; status: string }; mut: ReturnType<typeof trpc.admin.updateOrganization.useMutation> }) {
  const [name, setName] = useState(org.name);
  const [status, setStatus] = useState(org.status);
  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Status</Label>
        <Input value={status} onChange={(e) => setStatus(e.target.value)} />
      </div>
      <DialogFooter>
        <Button disabled={mut.isPending} onClick={() => mut.mutate({ id: org.id, name, status })}>
          {mut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
        </Button>
      </DialogFooter>
    </div>
  );
}
