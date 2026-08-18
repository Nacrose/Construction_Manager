"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminData() {
  const runSetup = trpc.admin.runDbSetup.useMutation({
    onSuccess: (r: any) => toast.success(`Setup complete: ${r.executed} executed, ${r.skipped} skipped`),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data</h1>
        <p className="text-sm text-muted-foreground">Database maintenance and seeding.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Database Setup</CardTitle>
          <CardDescription className="text-xs">
            Ensures all tables, columns and row-level-security policies exist. Safe to run repeatedly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled={runSetup.isPending} onClick={() => runSetup.mutate()}>
            {runSetup.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Run Database Setup
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Seed Catalogs</CardTitle>
          <CardDescription className="text-xs">
            Populate reference data (materials, rate presets) from the server. Run on a fresh database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>From the server shell:</p>
          <pre className="rounded bg-muted p-2 text-[11px]">npm run seed:all</pre>
          <p>Material catalog only:</p>
          <pre className="rounded bg-muted p-2 text-[11px]">npm run seed:catalog</pre>
        </CardContent>
      </Card>
    </div>
  );
}
