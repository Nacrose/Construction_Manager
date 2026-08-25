"use client";

import { useEffect, useState } from "react";
import { WifiOff, CloudOff, X, Download, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/lib/use-online-status";
import { useOfflineQueue, type QueueItem } from "@/lib/offline-queue";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWARegister — handles:
 *  1. Service Worker registration (waits for window load to not compete
 *     with first-paint resources).
 *  2. Listens for SW updates and prompts the user to refresh.
 *  3. Shows an install prompt when criteria are met.
 *  4. Renders an OfflineBanner when the network drops.
 *  5. Listens for "REPLAY_QUEUE" messages from the SW (Background Sync)
 *     and triggers queue replay.
 */
export function PWARegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallUI, setShowInstallUI] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const isOnline = useOnlineStatus();
  const { pendingCount, replay, lastError } = useOfflineQueue();

  // --- Service Worker registration ----------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Only register in production or when explicitly enabled.
    // In dev, SW caching can hide HMR changes.
    const isDev = process.env.NODE_ENV === "development";
    const swEnabled = !isDev || localStorage.getItem("cm-sw-dev") === "1";
    if (!swEnabled) return;

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Check for updates every 60 minutes
          setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);

          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
              }
            });
          });
        })
        .catch((err) => console.warn("[PWA] SW registration failed:", err));
    });

    // Listen for SW messages (Background Sync replay trigger)
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === "REPLAY_QUEUE") {
        replay();
      }
    };
    navigator.serviceWorker.addEventListener("message", messageHandler);

    return () => {
      navigator.serviceWorker.removeEventListener("message", messageHandler);
    };
  }, [replay]);

  // --- Install prompt -----------------------------------------------------
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      // Show install UI after a small delay (don't be aggressive)
      setTimeout(() => setShowInstallUI(true), 3000);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      toast.success("App installed", {
        description: "Find it on your home screen.",
      });
    }
    setInstallPrompt(null);
    setShowInstallUI(false);
  }

  // --- Apply SW update ----------------------------------------------------
  function applyUpdate() {
    if (typeof navigator === "undefined") return;
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage("SKIP_WAITING");
      }
    });
    window.location.reload();
  }

  return (
    <>
      {/* Update available banner */}
      {updateAvailable && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-amber-500/30 bg-amber-500/95 px-4 py-2 text-sm text-black shadow-lg backdrop-blur">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-4 w-4" />
            <span>A new version is available.</span>
            <button
              onClick={applyUpdate}
              className="rounded bg-black/20 px-2 py-0.5 font-medium hover:bg-black/30"
            >
              Reload
            </button>
            <button
              onClick={() => setUpdateAvailable(false)}
              className="text-black/60 hover:text-black"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Install prompt */}
      {showInstallUI && installPrompt && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 max-w-md rounded-lg border border-amber-500/30 bg-card p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <Download className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">Install Construction Manager</p>
              <p className="text-xs text-muted-foreground">
                Add to your home screen for full-screen, offline access on site.
              </p>
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleInstall} className="h-7 text-xs">
                  Install
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setShowInstallUI(false)}
                >
                  Not now
                </Button>
              </div>
            </div>
            <button
              onClick={() => setShowInstallUI(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Offline banner — only shown when offline OR when there are pending items */}
      <OfflineBanner
        isOnline={isOnline}
        pendingCount={pendingCount}
        lastError={lastError}
        onRetry={replay}
      />
    </>
  );
}

/**
 * OfflineBanner — sticky top bar shown when offline, or when there are
 * pending queued mutations waiting to sync.
 */
function OfflineBanner({
  isOnline,
  pendingCount,
  lastError,
  onRetry,
}: {
  isOnline: boolean;
  pendingCount: number;
  lastError: string | null;
  onRetry: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // If the situation changes (new errors, new pending items, or connectivity
  // flips), re-show the banner so the user is aware.
  useEffect(() => {
    if (mounted) {
      setDismissed(false);
    }
  }, [isOnline, pendingCount, lastError, mounted]);

  // Once dismissed, stay hidden until something changes
  if (!mounted || dismissed) return null;

  // Online and no pending → no banner
  if (isOnline && pendingCount === 0 && !lastError) return null;

  let icon = <WifiOff className="h-4 w-4" />;
  let bgClass = "bg-amber-500/95 text-black border-amber-600/40";
  let message = "";
  let action: React.ReactNode = null;

  if (!isOnline) {
    icon = <WifiOff className="h-4 w-4" />;
    message =
      pendingCount > 0
        ? `Offline — ${pendingCount} ${pendingCount === 1 ? "item" : "items"} queued, will sync automatically`
        : "You are offline — changes will be queued and synced when you reconnect";
    bgClass = "bg-amber-500/95 text-black border-amber-600/40";
  } else if (pendingCount > 0) {
    icon = <RefreshCw className="h-4 w-4 animate-spin" />;
    message = `Syncing ${pendingCount} ${pendingCount === 1 ? "item" : "items"}…`;
    bgClass = "bg-blue-500/95 text-white border-blue-600/40";
    action = (
      <button
        onClick={onRetry}
        className="ml-2 rounded bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30"
      >
        Retry now
      </button>
    );
  } else if (lastError) {
    icon = <AlertTriangle className="h-4 w-4" />;
    message = `Sync failed: ${lastError}`;
    bgClass = "bg-red-500/95 text-white border-red-600/40";
    action = (
      <button
        onClick={onRetry}
        className="ml-2 rounded bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30"
      >
        Retry
      </button>
    );
  } else {
    icon = <CheckCircle2 className="h-4 w-4" />;
    message = "All changes synced";
    bgClass = "bg-emerald-500/95 text-white border-emerald-600/40";
  }

  return (
    <div className={`sticky top-0 z-40 w-full border-b px-3 py-1.5 text-xs ${bgClass}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2">
        {icon}
        <span>{message}</span>
        {action}
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-3 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
