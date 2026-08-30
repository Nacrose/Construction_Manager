import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { setOrgContext } from "@/lib/rls";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Inbox } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

/**
 * Activity Log — SERVER COMPONENT.
 *
 * This page is a pure read (no interactivity), so it renders on the server:
 * no client JS for the page itself, no /api/audit round-trip after hydration,
 * and the HTML streams instantly (the (app) loading.tsx covers the wait).
 * The query mirrors GET /api/audit exactly (org RLS context + membership
 * scoping + same take limit).
 */

type Log = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: Date;
  user: { id: string; name: string; email: string } | null;
  project: { id: string; name: string; code: string } | null;
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  update: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  delete: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  submit: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  approve: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  archive: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function actionBadge(action: string) {
  const verb = action.split(".").pop() ?? action;
  return (
    <Badge variant="secondary" className={`text-xs ${ACTION_COLORS[verb] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}`}>
      {verb}
    </Badge>
  );
}

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // RLS defense-in-depth (the membership where-clause is the primary filter).
  await setOrgContext(db, user.organizationId, !!user.isSuperAdmin);

  const memberships = await db.projectMember.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  const projectIds = memberships.map((m) => m.projectId);

  const logs: Log[] = await db.auditLog.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true, code: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <History className="h-6 w-6" /> Activity Log
        </h1>
        <p className="text-sm text-muted-foreground">Audit trail of all actions across your projects.</p>
      </div>

      {logs.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {logs.map((log) => {
                const meta = log.metadata ? (() => { try { return JSON.parse(log.metadata); } catch { return null; } })() : null;
                return (
                  <li key={log.id} className="flex items-start gap-3 p-3 hover:bg-muted/20">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-medium text-white mt-0.5">
                      {log.user?.name?.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{log.user?.name ?? "System"}</span>
                        {actionBadge(log.action)}
                        <span className="text-xs text-muted-foreground">
                          {log.action.replace(/\./g, " ")}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {log.project && <span>{log.project.code} · {log.project.name} · </span>}
                        {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm")}
                        {meta?.number && ` · ${meta.number}`}
                        {meta?.name && ` · ${meta.name}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
