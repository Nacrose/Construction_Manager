"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileDropzone, AttachmentBadge } from "@/components/workflow/file-dropzone";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const RespondSchema = z.object({
  response: z.string().min(1, "Response is required"),
  decision: z.enum(["approved", "rejected", "info", "clarifications_requested"]),
});
type RespondValues = z.infer<typeof RespondSchema>;

export function RespondForm({ rfiId, projectId }: { rfiId: string; projectId: string }) {
  const utils = trpc.useUtils();
  const form = useForm<RespondValues>({
    resolver: zodResolver(RespondSchema),
    defaultValues: { response: "", decision: "approved" },
  });
  const decision = useWatch({ control: form.control, name: "decision" });
  const [attachFiles, setAttachFiles] = useState<Array<{ fileName: string; fileType: string; fileSize: number; data: string }>>([]);
  const uploadMutation = trpc.workflow.rfi.uploadAttachment.useMutation({});

  const mutation = trpc.workflow.rfi.respond.useMutation({
    onSuccess: () => {
      utils.workflow.rfi.get.invalidate({ id: rfiId });
      utils.workflow.rfi.list.invalidate({ projectId });
      toast.success("Response submitted");
      form.reset();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form onSubmit={form.handleSubmit(async (v) => {
      await mutation.mutateAsync({ id: rfiId, response: v.response, decision: v.decision });
      for (const f of attachFiles) await uploadMutation.mutateAsync({ rfiId, ...f });
      setAttachFiles([]);
    })} className="space-y-4 mt-2">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Response *</Label>
        <Textarea rows={3} placeholder="Enter your response..." {...form.register("response")}
          className="text-sm bg-background border-amber-200 dark:border-amber-900/50 focus-visible:ring-amber-500" />
        {form.formState.errors.response && <p className="text-xs text-red-500">{form.formState.errors.response.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Attachments</Label>
        <FileDropzone onUpload={(f) => setAttachFiles((p) => [...p, f])} uploading={false} />
        {attachFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {attachFiles.map((f, i) => <AttachmentBadge key={i} file={f} onRemove={() => setAttachFiles((p) => p.filter((_, j) => j !== i))} />)}
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Decision</Label>
        <Select value={decision} onValueChange={(v) => form.setValue("decision", v as RespondValues["decision"])}>
          <SelectTrigger className="bg-background border-amber-200 dark:border-amber-900/50 focus:ring-amber-500">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="approved">✅ Approve</SelectItem>
            <SelectItem value="rejected">❌ Reject</SelectItem>
            <SelectItem value="info">ℹ️ Provide Information</SelectItem>
            <SelectItem value="clarifications_requested">❓ Request Clarification</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          Submit
        </Button>
      </div>
    </form>
  );
}
