"use client";

import { use } from "react";
import { useParams } from "next/navigation";
import { GanttChart } from "./GanttChart";

/**
 * Gantt page — thin wrapper around the reusable GanttChart component.
 */
export default function OmniplanPage({ params }: { params?: Promise<{ id: string }> }) {
  const routeParams = useParams();
  const idFromHook = routeParams?.id as string;
  let id = idFromHook;
  if (!id && params) {
    try {
      const resolved = use(params);
      id = resolved?.id;
    } catch {
      // fallback
    }
  }

  if (!id) {
    return <div className="flex h-screen items-center justify-center text-xs font-mono text-muted-foreground">Loading Project Schedule…</div>;
  }

  return <GanttChart projectId={id} />;
}
