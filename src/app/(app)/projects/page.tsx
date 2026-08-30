"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpringCard } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, MapPin, Users, FileQuestion, Loader2, FolderKanban } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { GlowOrb } from "@/components/ui/motion";

type _Project = {
  id: string;
  name: string;
  code: string;
  client: string | null;
  location: string | null;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  myRole: string | null;
  rfiCount: number;
  memberCount: number;
};

import { AnimatedPage } from "@/components/ui/animated-page";

export default function ProjectsPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = trpc.project.list.useQuery();

  const createMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      toast.success("Project created");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = data?.projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      (p.client ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AnimatedPage className="space-y-8 pb-8">
      {/* Compact Cinematic Banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl bg-navy-gradient p-4 sm:p-5 text-white shadow-lg"
      >
        <GlowOrb color="amber" size={200} className="-top-20 -right-20 opacity-30" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Projects Portfolio</h1>
            <p className="text-xs text-white/70 mt-0.5">
              Active construction sites & project dashboards
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-amber-gradient text-white border-0 hover:opacity-90 shadow-md font-medium text-xs h-9 px-3">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New Project
              </Button>
            </DialogTrigger>
            <CreateProjectDialog
              onSubmit={(v) => createMutation.mutate(v)}
              loading={createMutation.isPending}
            />
          </Dialog>
        </div>
      </motion.div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, code, or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-12 rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 text-base"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-2xl" />
          ))}
        </div>
      ) : filtered?.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 text-center border-dashed border-2 shadow-sm">
          <FolderKanban className="h-16 w-16 text-slate-200 dark:text-slate-800 mb-4" />
          <h3 className="text-xl font-semibold">No projects found</h3>
          <p className="text-muted-foreground mt-2 max-w-sm">
            You don't have any projects matching your search. Try adjusting your filters or create a new project to get started.
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered?.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link href={`/projects/${p.id}`} className="group block h-full">
                <SpringCard glow="soft">
                  <Card className="h-full rounded-2xl border-border/60 shadow-sm overflow-hidden flex flex-col">
                  <CardHeader className="pb-3 flex-none bg-muted/30 border-b border-border/60">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-lg group-hover:text-primary transition-colors">
                          {p.name}
                        </CardTitle>
                        <p className="mt-1 font-mono text-xs font-medium text-muted-foreground bg-background/80 inline-block px-2 py-0.5 rounded-md border border-border/60">
                          {p.code}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`capitalize shrink-0 ${p.status === 'active' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' : ''}`}
                      >
                        {p.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </CardHeader>
                <CardContent className="space-y-4 pt-4 text-sm flex-1 flex flex-col">
                  <div className="space-y-2 flex-1">
                    {p.client && (
                      <p className="flex items-center gap-2 truncate text-muted-foreground">
                        <Users className="h-4 w-4 text-primary/60" />
                        {p.client}
                      </p>
                    )}
                    {p.location && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4 text-primary/60" />
                        {p.location}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground pt-4 border-t border-border/60">
                    <span className="flex items-center gap-1.5" title="Team Members">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="font-mono">{p.memberCount}</span>
                    </span>
                    <span className="flex items-center gap-1.5" title="RFIs">
                      <FileQuestion className="h-4 w-4 text-amber-500" />
                      <span className="font-mono">{p.rfiCount}</span>
                    </span>
                    <span className="ml-auto rounded-full bg-muted px-3 py-1 text-foreground/70 font-medium capitalize">
                      {(p.myRole || "no role").replace("_", " ")}
                    </span>
                  </div>
                </CardContent>
              </Card>
                </SpringCard>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </AnimatedPage>
  );
}

function CreateProjectDialog({
  onSubmit,
  loading,
}: {
  onSubmit: (values: any) => void;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [operationalPreset, setOperationalPreset] = useState<"record_keeper" | "lean" | "enterprise">("record_keeper");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      code: code.toUpperCase(),
      client: client || undefined,
      location: location || undefined,
      description: description || undefined,
      operationalPreset,
    });
  }

  return (
    <DialogContent className="sm:max-w-[650px] bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
          <FolderKanban className="h-5 w-5 text-emerald-400" /> Create New Contractor Project Site
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Initialize a contractual workspace for BOQ, site deliveries, Day Book vouchers, and client IPC billing.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        {/* Preset Selector */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-200">Contractor Scale & Operational Mode *</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "record_keeper" as const, icon: "📒", title: "Record-Keeper", sub: "Actuals only: Day Book, materials & labor." },
              { key: "lean" as const, icon: "⚡", title: "Lean Builder", sub: "Actuals + Daily Lookahead & Punch Lists." },
              { key: "enterprise" as const, icon: "🏛️", title: "Full Enterprise", sub: "CPM Gantt, 3-Way Match & JV Consortia." },
            ].map((p) => (
              <div
                key={p.key}
                onClick={() => setOperationalPreset(p.key)}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                  operationalPreset === p.key
                    ? "border-emerald-500 bg-emerald-950/30 text-white ring-1 ring-emerald-500/40"
                    : "border-white/10 bg-[#161d26] text-gray-400 hover:border-white/20 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                  <span>{p.icon}</span>
                  <span>{p.title}</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1 leading-tight">{p.sub}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="p-name" className="text-xs font-semibold">Project Name *</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kathmandu-Terai Fast Track PKG-02"
              required
              className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-code" className="text-xs font-semibold">Project Code *</Label>
            <Input
              id="p-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. KTFT-02"
              required
              pattern="[A-Z0-9-]+"
              className="h-9 text-xs font-mono font-bold bg-[#161d26] border-white/10 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="p-client" className="text-xs font-semibold">Client / Employer Office</Label>
            <Input
              id="p-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="e.g. Division Road Office, Hetauda / DUDBC"
              className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-loc" className="text-xs font-semibold">Site Location / District</Label>
            <Input
              id="p-loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Makwanpur / Chitwan"
              className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="p-desc" className="text-xs">Contract Scope / Description (Optional)</Label>
          <Textarea
            id="p-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="e.g. 4-lane asphalt road upgradation with 3 RCC bridges and slope protection."
            className="text-xs bg-[#161d26] border-white/10 text-white resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
          <Button
            type="submit"
            disabled={loading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5 shadow-[0_0_12px_rgba(0,255,102,0.2)]"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Project Workspace
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
