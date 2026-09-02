"use client";

import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";

export function SubmitButton({ submittalId, projectId }: { submittalId: string; projectId: string }) {
  const utils = trpc.useUtils();
  const mut = trpc.submittal.submit.useMutation({
    onSuccess: () => { utils.submittal.list.invalidate({ projectId }); utils.submittal.stats.invalidate({ projectId }); toast.success("Submittal submitted"); },
    onError: (e) => toast.error(e.message),
  });
  return <button onClick={() => mut.mutate({ id: submittalId })} disabled={mut.isPending} className="text-[9px] text-info hover:underline">Submit</button>;
}
