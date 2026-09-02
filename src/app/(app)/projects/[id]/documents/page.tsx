"use client";

import { trpc } from "@/lib/trpc-client";
import { use, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Inbox, Loader2, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Doc = {
  id: string; number: string; title: string; type: string; discipline: string | null;
  status: string; revision: string; issuedDate: Date | null; receivedFrom: string | null;
  _count: { revisions: number };
};

const TYPE_COLORS: Record<string, string> = {
  drawing: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  spec: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  contract: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  report: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  letter: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};

import { AnimatedPage } from "@/components/ui/animated-page";

export default function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const docsQuery = trpc.document.listDocuments.useInfiniteQuery(
    { projectId: id },
    {
      getNextPageParam: (last) =>
        // Documents take paging priority; transmittals ride the same cursor.
        last.documentsHasMore ? last.documentsNextCursor : last.transmittalsHasMore ? last.transmittalsNextCursor : undefined,
    }
  );
  const data = docsQuery.data;
  const allDocs = data ? data.pages.flatMap((p) => p.documents) : [];
  const allTransmittals = data ? data.pages.flatMap((p) => p.transmittals) : [];

  const canWrite = projectInfo?.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector";
  const filtered = allDocs.filter(
    (d) => d.number.toLowerCase().includes(search.toLowerCase()) || d.title.toLowerCase().includes(search.toLowerCase())
  ) as Doc[];

  return (
    <AnimatedPage className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/projects/${id}`} className="hover:text-foreground">Project</Link><span>/</span><span>Documents</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Document Control</h1>
          <p className="text-sm text-muted-foreground">Register, revisions, and transmittals.</p>
        </div>
        {canWrite && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add document</Button></DialogTrigger>
            <AddDocDialog projectId={id} onDone={() => setAddOpen(false)} />
          </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search documents…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {docsQuery.isLoading ? <Skeleton className="h-64" /> : !filtered?.length ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground" /><p className="text-sm text-muted-foreground">No documents yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{d.number}</span>
                    <Badge variant="secondary" className={`text-xs ${TYPE_COLORS[d.type] ?? TYPE_COLORS.general}`}>{d.type}</Badge>
                    <Badge variant="outline">Rev {d.revision}</Badge>
                    {d.discipline && <Badge variant="outline" className="capitalize">{d.discipline}</Badge>}
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.issuedDate ? `Issued ${format(new Date(d.issuedDate), "dd MMM yyyy")}` : "Not issued"}
                    {d.receivedFrom && ` · From ${d.receivedFrom}`}
                    {d._count.revisions > 0 && ` · ${d._count.revisions} revisions`}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
          {docsQuery.hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" onClick={() => docsQuery.fetchNextPage()} disabled={docsQuery.isFetchingNextPage}>
                {docsQuery.isFetchingNextPage ? "Loading…" : "Load more documents"}
              </Button>
            </div>
          )}
        </div>
      )}

      {allTransmittals.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><Send className="h-4 w-4" /> Recent Transmittals</h3>
            <div className="space-y-2">
              {allTransmittals.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{t.number}</span>
                  <span className="text-muted-foreground">To: {t.sentTo}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(t.date), "dd MMM yyyy")}</span>
                  <Badge variant="outline" className="capitalize text-xs">{t.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </AnimatedPage>
  );
}
function AddDocDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("general");
  const [discipline, setDiscipline] = useState("");
  const [revision, setRevision] = useState("A");

  const mutation = trpc.document.createDocument.useMutation({
    onSuccess: () => {
      utils.document.listDocuments.invalidate({ projectId });
      toast.success("Document added");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      projectId,
      number,
      title,
      type,
      discipline: discipline || undefined,
      revision,
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Add document</DialogTitle></DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Number *</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} required placeholder="DOC-001" /></div>
          <div className="space-y-1.5"><Label>Type</Label><Input value={type} onChange={(e) => setType(e.target.value)} placeholder="general" /></div>
        </div>
        <div className="space-y-1.5"><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Discipline</Label><Input value={discipline} onChange={(e) => setDiscipline(e.target.value)} placeholder="civil" /></div>
          <div className="space-y-1.5"><Label>Revision</Label><Input value={revision} onChange={(e) => setRevision(e.target.value)} /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
