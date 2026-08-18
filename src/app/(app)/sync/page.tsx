"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CloudOff,
  Smartphone,
  Download,
  X,
  Database,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOnlineStatus } from "@/lib/use-online-status";
import { useOfflineQueue } from "@/lib/offline-queue";
import { toast } from "sonner";
import { NotificationPermission } from "@/components/notification-permission";

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default function SyncPage() {
  const isOnline = useOnlineStatus();
  const { items, pendingCount, isReplaying, lastError, replay, discard, clear } =
    useOfflineQueue();
  const [swState, setSwState] = useState<string>("checking");
  const [installable, setInstallable] = useState(false);
  const [precaching, setPrecaching] = useState(false);
  const [precacheProgress, setPrecacheProgress] = useState(0);
  const [precacheStatus, setPrecacheStatus] = useState<string>("");

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      setSwState("unsupported");
      return;
    }
    navigator.serviceWorker.getRegistration().then((reg) => {
      setSwState(reg ? "registered" : "unregistered");
    });

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  async function handleReplay() {
    const result = await replay();
    if (result.success > 0) {
      toast.success(`Synced ${result.success} item${result.success === 1 ? "" : "s"}`);
    }
    if (result.failed > 0) {
      toast.error(`${result.failed} item${result.failed === 1 ? "" : "s"} failed to sync`);
    }
    if (result.success === 0 && result.failed === 0 && result.remaining === 0) {
      toast.info("Nothing to sync");
    }
  }

  async function handleClear() {
    if (!confirm("Discard all queued items? This cannot be undone.")) return;
    await clear();
    toast.success("Queue cleared");
  }

  /**
   * Pre-cache: fetch key routes through the SW so they get cached for
   * offline use. Progress bar reflects current step.
   */
  async function handlePrecache() {
    setPrecaching(true);
    setPrecacheProgress(0);
    setPrecacheStatus("Fetching route list…");

    try {
      // Step 1: prefetch dashboard + projects list
      const routes = [
        { url: "/dashboard", label: "Dashboard" },
        { url: "/projects", label: "Projects list" },
        { url: "/sync", label: "Sync Status page" },
        { url: "/offline", label: "Offline fallback page" },
      ];

      // Try to fetch the user's projects list to cache each project's overview
      // (best-effort — if it fails we still cache the list page)
      let projectRoutes: { url: string; label: string }[] = [];
      try {
        setPrecacheStatus("Fetching projects…");
        const res = await fetch("/api/trpc/project.list?input=%7B%22json%22%3Anull%7D", {
          headers: { "content-type": "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          const projects = (data?.[0]?.result?.data?.json?.items ??
                           data?.[0]?.result?.data?.json ??
                           []) as { id: string; name: string }[];
          projectRoutes = projects.slice(0, 20).map((p) => ({
            url: `/projects/${p.id}`,
            label: `Project: ${p.name}`,
          }));
        }
      } catch (_) {
        /* ignore — project routes are nice-to-have */
      }

      const allRoutes = [...routes, ...projectRoutes];

      // Step 2: fetch each route through the SW
      for (let i = 0; i < allRoutes.length; i++) {
        const route = allRoutes[i];
        setPrecacheStatus(`Caching ${route.label}…`);
        setPrecacheProgress(Math.round((i / allRoutes.length) * 100));
        try {
          await fetch(route.url, { cache: "force-cache" }).catch(() => {});
        } catch (_) {
          /* ignore individual route failures */
        }
      }

      setPrecacheProgress(100);
      setPrecacheStatus("Done!");
      toast.success(`Cached ${allRoutes.length} pages for offline use`);
      setTimeout(() => {
        setPrecaching(false);
        setPrecacheStatus("");
      }, 1500);
    } catch (err) {
      toast.error("Pre-cache failed — try again later");
      setPrecaching(false);
      setPrecacheStatus("");
    }
  }

  const pendingItems = items.filter(
    (i) => i.status === "pending" || i.status === "failed"
  );
  const syncedItems = items.filter((i) => i.status === "success");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sync Status</h1>
          <p className="text-sm text-muted-foreground">
            Manage offline data and pending changes
          </p>
        </div>
        <Button onClick={handleReplay} disabled={isReplaying || pendingCount === 0}>
          {isReplaying ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {isReplaying ? "Syncing…" : "Sync Now"}
        </Button>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Connection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {isOnline ? (
                <>
                  <Wifi className="h-5 w-5 text-emerald-500" />
                  <span className="text-lg font-semibold">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-5 w-5 text-amber-500" />
                  <span className="text-lg font-semibold">Offline</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Pending Sync
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <span className="text-lg font-semibold">{pendingCount}</span>
              <span className="text-xs text-muted-foreground">items</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              App Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-blue-500" />
              <span className="text-lg font-semibold capitalize">
                {typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches
                  ? "Installed"
                  : "Browser"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Service Worker
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {swState === "registered" ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="text-lg font-semibold">Active</span>
                </>
              ) : swState === "unsupported" ? (
                <>
                  <X className="h-5 w-5 text-red-500" />
                  <span className="text-lg font-semibold">Unsupported</span>
                </>
              ) : swState === "unregistered" ? (
                <>
                  <CloudOff className="h-5 w-5 text-muted-foreground" />
                  <span className="text-lg font-semibold">Inactive</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
                  <span className="text-lg font-semibold">Checking…</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Install prompt */}
      {installable && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Download className="h-5 w-5 text-amber-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium">Install Construction Manager</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Add this app to your home screen for full-screen, offline access on site.
                  Works on Android, iOS, and desktop.
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    // Re-dispatch the deferred prompt
                    window.dispatchEvent(new Event("beforeinstallprompt"));
                  }}
                >
                  Install Now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error banner */}
      {lastError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-red-700 dark:text-red-400">
                  Sync Error
                </h3>
                <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                  {lastError}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  The item will be retried automatically. You can also retry manually or discard it below.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Push notifications */}
      <NotificationPermission />

      {/* Pre-cache card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            Pre-cache Pages for Offline Use
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Click the button below to fetch and cache all your projects&rsquo; overview pages.
            Once cached, they&rsquo;ll be available offline.
          </p>
          <Button onClick={handlePrecache} disabled={precaching || !isOnline}>
            {precaching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {precacheStatus} ({precacheProgress}%)
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Cache All Projects Now
              </>
            )}
          </Button>
          {precaching && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${precacheProgress}%` }}
              />
            </div>
          )}
          {!isOnline && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              You&rsquo;re currently offline — connect to the internet to pre-cache pages.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Queue items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Pending Changes</CardTitle>
          {pendingItems.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleClear}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Discard All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {pendingItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
              No pending changes — you&rsquo;re all synced up.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        item.status === "failed"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-amber-500/10 text-amber-500"
                      }`}
                    >
                      {item.status === "failed" ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {item.label ?? item.entityType ?? "Queued change"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.url} · {item.method} · {formatRelativeTime(item.createdAt)}
                      </p>
                      {item.lastError && (
                        <p className="text-xs text-red-500 truncate mt-0.5">
                          {item.lastError}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      attempt {item.attempts + (item.status === "failed" ? 1 : 0)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => discard(item.id)}
                      title="Discard"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help / explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How Offline Mode Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Installation:</strong> Open the app once
            while online. The app shell (HTML, JS, CSS, fonts) is cached by the Service
            Worker, so subsequent loads work without internet.
          </p>
          <p>
            <strong className="text-foreground">Reading data:</strong> tRPC queries
            (lists, details) are cached too. Pages you&rsquo;ve visited before will load
            offline with the data you last saw.
          </p>
          <p>
            <strong className="text-foreground">Writing data:</strong> When offline, all
            mutations (create, update, delete) are stored locally in your browser&rsquo;s
            IndexedDB. They&rsquo;re shown here as &ldquo;Pending Changes&rdquo;.
          </p>
          <p>
            <strong className="text-foreground">Auto-sync:</strong> When the network
            returns, pending items are replayed automatically in the order they were
            created. You can also trigger sync manually with the &ldquo;Sync Now&rdquo;
            button.
          </p>
          <p>
            <strong className="text-foreground">Conflicts:</strong> If two users edit the
            same record while offline, last-write-wins. Records updated most recently
            overwrite earlier ones.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
