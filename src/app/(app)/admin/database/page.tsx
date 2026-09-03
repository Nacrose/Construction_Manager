"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";

export default function AdminDatabase() {
  // Read-only schema verification — runtime DDL was retired; Prisma
  // migrations are the single source of truth (run `npx prisma migrate
  // deploy` to apply them). This check fails loudly instead of patching.
  const verify = trpc.admin.verifyDbSchema.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Database</h1>
        <p className="text-sm text-muted-foreground">Schema, row-level-security, and seeding.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Schema & RLS — Verify</CardTitle>
          <CardDescription className="text-xs">
            Read-only check that critical tables exist and Project RLS is enabled, forced, and
            carrying its four isolation policies. This page no longer mutates the schema — apply
            migrations with <code className="font-mono">npx prisma migrate deploy</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={verify.isFetching} onClick={() => verify.refetch()}>
              {verify.isFetching && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Re-check Schema
            </Button>
            {verify.data && (
              <span
                className={
                  verify.data.ok
                    ? "text-xs font-medium text-success"
                    : "text-xs font-medium text-red-600"
                }
              >
                {verify.data.ok
                  ? "OK — all checked tables present, Project RLS forced."
                  : `INCOMPLETE — ${verify.data.missingTables.length} table(s) missing.`}
              </span>
            )}
          </div>
          {verify.error && (
            <pre className="rounded bg-muted p-2 text-[11px] text-red-600">
              {verify.error.message}
            </pre>
          )}
          {verify.data && (
            <pre className="rounded bg-muted p-2 text-[11px]">
              {JSON.stringify(
                {
                  ok: verify.data.ok,
                  missingTables: verify.data.missingTables,
                  checkedTables: verify.data.checkedTables,
                  projectRls: verify.data.rls.project,
                },
                null,
                2,
              )}
            </pre>
          )}
          {verify.data?.instruction && (
            <p className="text-xs text-amber-600">{verify.data.instruction}</p>
          )}
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
