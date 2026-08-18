"use client";

import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function PunchStatusActions({ item, projectId, onDone }: { item: any; projectId: string; onDone: () => void }) {
  const mut = trpc.punchList.updateStatus.useMutation({ onSuccess: () => { toast.success("Status updated"); onDone(); }, onError: (e) => toast.error(e.message) });
  const nextStatus: Record<string, string | null> = { open: "in_progress", in_progress: "resolved", resolved: "verified", verified: "closed", closed: null };
  const next = nextStatus[item.status];
  if (!next) return null;
  const labels: Record<string, string> = { in_progress: "Start", resolved: "Resolve", verified: "Verify", closed: "Close" };
  return <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => mut.mutate({ id: item.id, status: next as any })} disabled={mut.isPending}>{labels[next]}</Button>;
}
