"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminDatabase() {
  const [last, setLast] = useState<string>("");
  const runSetup = trpc.admin.runDbSetup.useMutation({
    onSuccess: (r: any) => {
      setLast(`Executed: ${r.executed}, Skipped: ${r.skipped}, Failed: ${r.failed}`);
      toast.success("Database setup complete");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Database</h1>
        <p className="text-sm text-muted-foreground">Schema and row-level-security status.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Schema & RLS</CardTitle>
          <CardDescription className="text-xs">
            Applies the baseline migration and re-enables Row-Level Security policies for
            organization isolation. Idempotent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button disabled={runSetup.isPending} onClick={() => runSetup.mutate()}>
            {runSetup.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Apply / Verify Schema
          </Button>
          {last && <pre className="rounded bg-muted p-2 text-[11px]">{last}</pre>}
        </CardContent>
      </Card>
    </div>
  );
}
