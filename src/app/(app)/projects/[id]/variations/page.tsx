"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FileSignature } from "lucide-react";
import { format } from "date-fns";
import { AnimatedPage } from "@/components/ui/animated-page";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BoqVersionsTab } from "../boq/components/boq-versions-tab";

export default function VariationsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: projectData } = trpc.project.get.useQuery({ id: projectId });
  const { data: vos, isLoading } = trpc.variationOrder.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const myRole = projectData?.myRole ?? "";
  const canWrite = myRole && myRole !== "client" && myRole !== "inspector";

  const createMutation = trpc.variationOrder.create.useMutation({
    onSuccess: (data) => {
      utils.variationOrder.list.invalidate({ projectId });
      toast.success("Variation Order created successfully");
      setCreateOpen(false);
      router.push(`/projects/${projectId}/variations/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      projectId,
      number: newNumber,
      title: newTitle,
      description: newDesc,
    });
  };

  const filteredVOs = vos?.filter(
    (vo) =>
      vo.number.toLowerCase().includes(q.toLowerCase()) ||
      vo.title.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Variation Orders</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage contract variations, track BOQ changes, and approve extra items.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Variation Order
        </Button>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Variation Orders</TabsTrigger>
          <TabsTrigger value="snapshots">BOQ Snapshots</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 max-w-sm">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by VO number or title..."
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="shimmer h-48 bg-muted/50" />
              ))}
            </div>
          ) : filteredVOs?.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className="flex flex-col items-center justify-center py-16 text-center border-dashed">
                <FileSignature className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold">No Variation Orders found</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  Create your first Variation Order to record changes to the baseline BOQ.
                </p>
                <Button onClick={() => setCreateOpen(true)} className="mt-4 gap-2" variant="outline">
                  <Plus className="h-4 w-4" /> Create VO
                </Button>
              </Card>
            </motion.div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredVOs?.map((vo) => (
                <Card
                  key={vo.id}
                  className="hover:border-primary/50 transition-colors cursor-pointer group"
                  onClick={() => router.push(`/projects/${projectId}/variations/${vo.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                          {vo.number}
                        </CardTitle>
                        <p className="text-sm font-medium mt-1 truncate max-w-[200px]" title={vo.title}>
                          {vo.title}
                        </p>
                      </div>
                      <Badge
                        variant={
                          vo.status === "approved"
                            ? "default"
                            : vo.status === "submitted"
                            ? "secondary"
                            : vo.status === "rejected"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {vo.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {vo.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {vo.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                      <span>{vo._count.items} changed items</span>
                      <span>{format(new Date(vo.createdAt), "MMM d, yyyy")}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="snapshots" className="mt-4">
          <BoqVersionsTab projectId={projectId} canWrite={!!canWrite} />
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Variation Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>VO Number *</Label>
              <Input
                placeholder="e.g. VO-001"
                required
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="e.g. Additional Earthworks for Retaining Wall"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Briefly describe the reason for this variation..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create & Edit Details"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  );
}
