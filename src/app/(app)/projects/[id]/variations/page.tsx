"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { z } from "zod";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FileSignature } from "lucide-react";
import { format } from "date-fns";
import { AnimatedPage } from "@/components/ui/animated-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BoqVersionsTab } from "../boq/components/boq-versions-tab";
import { FormDialogEngine } from "@/components/engine/form-dialog-engine";
import { FormTextField, FormTextareaField } from "@/components/engine/form-fields";

const createVOSchema = z.object({
  number: z.string().min(1, "VO number is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string(),
});

export default function VariationsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: projectData } = trpc.project.get.useQuery({ id: projectId });
  const { data: vos, isLoading } = trpc.variationOrder.list.useQuery({ projectId });

  const myRole = projectData?.myRole ?? "";
  const canWrite = myRole && myRole !== "client" && myRole !== "inspector";

  const filteredVOs = vos?.filter(
    (vo) =>
      vo.number.toLowerCase().includes(q.toLowerCase()) ||
      vo.title.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <AnimatedPage className="space-y-4 pb-8">
      <Tabs defaultValue="orders">
        {/* Single-Row Action & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-[#c7d8e8] bg-white">
          <TabsList className="bg-[#f8fbfe] border border-[#c7d8e8] p-0.5 rounded-xl">
            <TabsTrigger value="orders" className="text-xs rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-medium">
              Variation Orders ({vos?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="snapshots" className="text-xs rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-medium">
              BOQ Snapshots
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search VO number/title..."
                className="pl-8 h-9 text-xs bg-[#f8fbfe] border-[#c7d8e8] text-slate-900 rounded-xl"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {canWrite && (
              <Button onClick={() => setCreateOpen(true)} size="sm" className="h-9 px-4 text-xs font-bold amber-cta-btn rounded-xl shadow-[0_0_20px_rgba(0,255,102,0.3)] transition gap-1.5 shrink-0">
                <Plus className="h-3.5 w-3.5" /> + New Variation Order
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="orders" className="mt-4 space-y-4">

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

      {/* Create Variation Order — FormDialogEngine (Tier 2): framing, state, validation,
          toast, invalidation, close/reset owned by the engine; onSuccess navigates. */}
      {canWrite && (
        <FormDialogEngine
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="Create Variation Order"
          description="Record a change to the baseline BOQ. You can attach changed items after creation."
          icon={FileSignature}
          size="md"
          initialValues={{ number: "", title: "", description: "" }}
          schema={createVOSchema}
          mutation={trpc.variationOrder.create}
          buildInput={(v) => ({
            projectId,
            number: v.number,
            title: v.title,
            description: v.description || undefined,
          })}
          invalidate={(u) => u.variationOrder.list.invalidate({ projectId })}
          successMessage="Variation Order created successfully"
          onSuccess={(data) => router.push(`/projects/${projectId}/variations/${data.id}`)}
          submitLabel="Create & Edit Details"
        >
          <FormTextField name="number" label="VO Number" required placeholder="e.g. VO-001" />
          <FormTextField
            name="title"
            label="Title"
            required
            placeholder="e.g. Additional Earthworks for Retaining Wall"
          />
          <FormTextareaField
            name="description"
            label="Description"
            placeholder="Briefly describe the reason for this variation..."
          />
        </FormDialogEngine>
      )}
    </AnimatedPage>
  );
}
