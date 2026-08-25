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
                    Configure contractor operating scale, financial authority, and physical stock procurement models.
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

const OPERATING_MODELS = [
  {
    id: "centralized",
    title: "1. HQ-Centralized Imprest",
    subtitle: "केन्द्रीय खरिद र लेखा",
    finance: "HQ controls all bank payouts. Site receives petty cash advances for daily site expenses.",
    inventory: "HQ contracts all bulk materials centrally. Site receives & verifies delivery challans.",
  },
  {
    id: "imprest_only",
    title: "2. Hybrid Delegation",
    subtitle: "संयुक्त साइट र मुख्य कार्यालय",
    finance: "Site logs daily Day Book cash & wages. HQ disburses major contractor & vendor bills.",
    inventory: "Site procures local materials directly. HQ manages major long-lead supply contracts.",
  },
  {
    id: "site_autonomous",
    title: "3. Autonomous Site Office",
    subtitle: "पूर्ण साइट अधिकार",
    finance: "Site manages project bank accounts, direct vendor payments, and local VAT/TDS.",
    inventory: "Site manages 100% of its own procurement, local vendor quotes, and central site store.",
  },
] as const;

function CreateOrgForm({ mut }: { mut: ReturnType<typeof trpc.admin.createOrganization.useMutation> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("active");
  const [orgScale, setOrgScale] = useState<"single_project_jv" | "multi_project">("multi_project");
  const [partnershipType, setPartnershipType] = useState<"sole" | "lead_partner_jv" | "joint_jv">("sole");
  const [financeLocation, setFinanceLocation] = useState<"centralized" | "site_autonomous" | "imprest_only">("centralized");

  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  return (
    <div className="space-y-4 pt-2 font-sans text-xs">
      {/* 2-Column Horizontal Split Layout: Left = Identity & Scale, Right = Admin Setup */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* Left 7 Columns: Company Details & Structure */}
        <div className="md:col-span-7 space-y-3">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] font-semibold text-gray-300">Company Name (कम्पनीको नाम)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Anturam Construction Pvt. Ltd."
                className="h-8 text-xs bg-[#121820] border-white/10 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-300">Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. ACPL"
                className="h-8 text-xs bg-[#121820] border-white/10 text-white font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-300">Organization Scale</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setOrgScale("multi_project")}
                  className={cn(
                    "p-2 rounded-lg border text-left transition",
                    orgScale === "multi_project"
                      ? "border-emerald-500 bg-emerald-500/10 text-white"
                      : "border-white/10 bg-[#121820] text-gray-400 hover:text-white"
                  )}
                >
                  <div className="font-bold text-[11px]">🏢 Multi-Site</div>
                  <div className="text-[9px] text-gray-400">Multiple sites</div>
                </button>
                <button
                  type="button"
                  onClick={() => setOrgScale("single_project_jv")}
                  className={cn(
                    "p-2 rounded-lg border text-left transition",
                    orgScale === "single_project_jv"
                      ? "border-emerald-500 bg-emerald-500/10 text-white"
                      : "border-white/10 bg-[#121820] text-gray-400 hover:text-white"
                  )}
                >
                  <div className="font-bold text-[11px]">🤝 Single Project</div>
                  <div className="text-[9px] text-gray-400">Dedicated contract</div>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-300">Partnership Type</Label>
              <Select value={partnershipType} onValueChange={(v: any) => setPartnershipType(v)}>
                <SelectTrigger className="h-9 text-xs bg-[#121820] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-white/10 text-xs">
                  <SelectItem value="sole">Sole Contractor / Private Firm</SelectItem>
                  <SelectItem value="lead_partner_jv">Lead Managing Partner in JV</SelectItem>
                  <SelectItem value="joint_jv">Jointly Operated JV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Initial Org Administrator */}
        <div className="md:col-span-5 space-y-2 bg-[#121820]/60 p-3 rounded-xl border border-white/5">
          <Label className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
            Initial Org Admin Account (ऐच्छिक)
          </Label>
          <div className="space-y-1.5">
            <Input
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Admin Full Name"
              className="h-8 text-xs bg-[#0b0f17] border-white/10 text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@company.com"
                className="h-8 text-xs bg-[#0b0f17] border-white/10 text-white"
              />
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Password (8+ chars)"
                className="h-8 text-xs bg-[#0b0f17] border-white/10 text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Wide Section: Operating & Procurement Model Cards (Width >> Height) */}
      <div className="space-y-1.5 pt-2 border-t border-white/10">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold text-white">
            Contractor Financial Authority &amp; Material Procurement Model (लेखा र खरिद मोडेल)
          </Label>
          <span className="text-[10px] text-gray-400">Controls how money and materials flow across all sites</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {OPERATING_MODELS.map((model) => {
            const isSelected = financeLocation === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => setFinanceLocation(model.id as any)}
                className={cn(
                  "p-3 rounded-xl border text-left flex flex-col justify-between transition relative",
                  isSelected
                    ? "border-emerald-500 bg-emerald-500/10 text-white shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/60"
                    : "border-white/10 bg-[#121820]/70 text-gray-400 hover:border-white/20 hover:text-gray-200"
                )}
              >
                <div>
                  <div className="flex items-baseline justify-between gap-1 mb-1">
                    <span className="font-bold text-xs text-white leading-tight">{model.title}</span>
                    <span className="text-[9px] text-emerald-400 font-mono">{model.subtitle}</span>
                  </div>
                  <div className="space-y-1 text-[11px] leading-snug mt-1.5">
                    <div className="text-gray-300">
                      <span className="text-emerald-400 font-semibold font-mono">💰 Finance:</span> {model.finance}
                    </div>
                    <div className="text-gray-300">
                      <span className="text-blue-400 font-semibold font-mono">📦 Stock:</span> {model.inventory}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between border-t border-white/10 mt-3">
        <div className="text-[10px] text-gray-400 font-mono">
          Ready to bootstrap contractor workspace
        </div>
        <Button
          disabled={mut.isPending || !name}
          onClick={() =>
            mut.mutate({
              name,
              code: code || undefined,
              status,
              orgScale,
              partnershipType,
              financeLocation,
              adminName: adminName || undefined,
              adminEmail: adminEmail || undefined,
              adminPassword: adminPassword || undefined,
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
    orgScale?: string;
    partnershipType?: string;
    financeLocation?: string;
  };
  mut: ReturnType<typeof trpc.admin.updateOrganization.useMutation>;
}) {
  const [name, setName] = useState(org.name);
  const [status, setStatus] = useState(org.status);
  const [orgScale, setOrgScale] = useState<"single_project_jv" | "multi_project">(
    (org.orgScale as any) || "multi_project"
  );
  const [partnershipType, setPartnershipType] = useState<"sole" | "lead_partner_jv" | "joint_jv">(
    (org.partnershipType as any) || "sole"
  );
  const [financeLocation, setFinanceLocation] = useState<"centralized" | "site_autonomous" | "imprest_only">(
    (org.financeLocation as any) || "centralized"
  );

  return (
    <div className="space-y-4 pt-2 font-sans text-xs">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-gray-300">Company Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-xs bg-[#121820] border-white/10 text-white"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-gray-300">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs bg-[#121820] border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0f141c] border-white/10 text-xs">
              <SelectItem value="active">Active (सक्रिय)</SelectItem>
              <SelectItem value="archived">Archived (संग्रहित)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-white/10">
        <Label className="text-xs font-bold text-white block">
          Operating &amp; Procurement Model
        </Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {OPERATING_MODELS.map((model) => {
            const isSelected = financeLocation === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => setFinanceLocation(model.id as any)}
                className={cn(
                  "p-3 rounded-xl border text-left flex flex-col justify-between transition",
                  isSelected
                    ? "border-emerald-500 bg-emerald-500/10 text-white shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/60"
                    : "border-white/10 bg-[#121820]/70 text-gray-400 hover:border-white/20 hover:text-gray-200"
                )}
              >
                <div>
                  <div className="flex items-baseline justify-between gap-1 mb-1">
                    <span className="font-bold text-xs text-white leading-tight">{model.title}</span>
                    <span className="text-[9px] text-emerald-400 font-mono">{model.subtitle}</span>
                  </div>
                  <div className="space-y-1 text-[11px] leading-snug mt-1.5">
                    <div className="text-gray-300">
                      <span className="text-emerald-400 font-semibold font-mono">💰 Finance:</span> {model.finance}
                    </div>
                    <div className="text-gray-300">
                      <span className="text-blue-400 font-semibold font-mono">📦 Stock:</span> {model.inventory}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <DialogFooter className="pt-2 border-t border-white/10 mt-3">
        <Button
          disabled={mut.isPending}
          onClick={() =>
            mut.mutate({
              id: org.id,
              name,
              status,
              orgScale,
              partnershipType,
              financeLocation,
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
