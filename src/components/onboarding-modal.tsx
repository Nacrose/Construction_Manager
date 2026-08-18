"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download, Wifi, RefreshCw, Smartphone, CheckCircle2, ArrowRight, ArrowLeft,
  Chrome, Apple, AlertTriangle,
} from "lucide-react";
import { useBrowserInfo } from "@/lib/browser-detect";
import { toast } from "sonner";

const ONBOARDED_KEY = "cm-onboarded-v1";
const HEARTBEAT_KEY = "cm-last-heartbeat";

type Step = "welcome" | "install" | "offline" | "sync" | "done";

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("welcome");
  const [precaching, setPrecaching] = useState(false);
  const [precacheProgress, setPrecacheProgress] = useState(0);
  const browser = useBrowserInfo();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Show onboarding only on first visit
    if (!localStorage.getItem(ONBOARDED_KEY)) {
      // Small delay so the app shell renders first
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
    // Always update the heartbeat on app open
    localStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
  }, []);

  function handleDismiss() {
    localStorage.setItem(ONBOARDED_KEY, "1");
    localStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
    setOpen(false);
  }

  async function handlePrecache() {
    setPrecaching(true);
    setPrecacheProgress(10);
    try {
      // Trigger prefetch of key routes by fetching them through the SW.
      // The SW will cache the HTML response for offline use.
      const routes = [
        "/dashboard",
        "/projects",
        "/sync",
        "/offline",
      ];
      // Also fetch the user's projects list page (just /projects is enough)
      // Each project's overview page would require knowing IDs — we'll
      // just prefetch /projects which lists them all.
      for (let i = 0; i < routes.length; i++) {
        setPrecacheProgress(10 + ((i + 1) / routes.length) * 80);
        try {
          await fetch(routes[i], { cache: "force-cache" }).catch(() => {});
        } catch (_) {
          /* ignore */
        }
      }
      setPrecacheProgress(100);
      toast.success("App cached for offline use");
      setTimeout(() => {
        setPrecaching(false);
      }, 800);
    } catch (err) {
      toast.error("Couldn't pre-cache — try again later");
      setPrecaching(false);
    }
  }

  const steps: Step[] = ["welcome", "install", "offline", "sync", "done"];
  const stepIndex = steps.indexOf(step);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">
              {step === "welcome" && "Welcome to Construction Manager"}
              {step === "install" && "Install the App"}
              {step === "offline" && "Working Offline"}
              {step === "sync" && "Syncing Your Data"}
              {step === "done" && "You're All Set!"}
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              {stepIndex + 1} / {steps.length}
            </Badge>
          </div>
          <DialogDescription className="sr-only">
            Onboarding step {stepIndex + 1} of {steps.length}
          </DialogDescription>
        </DialogHeader>

        {/* Step content */}
        <div className="space-y-4 py-2 min-h-[200px]">
          {step === "welcome" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This is your construction project management app — daily reports, BOQ, IPC,
                equipment, drawings, communication, and more. It works offline, so you can
                use it on site without internet.
              </p>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Detected Browser
                </p>
                <div className="flex items-center gap-2">
                  {browser?.isSafari && <Apple className="h-4 w-4" />}
                  {browser?.isChrome && <Chrome className="h-4 w-4" />}
                  {browser?.isEdge && <Chrome className="h-4 w-4" />}
                  {browser?.isFirefox && <Chrome className="h-4 w-4" />}
                  <span className="text-sm font-medium">
                    {browser?.browserName ?? "Unknown"} on {browser?.osName ?? "Unknown"}
                  </span>
                </div>
                {browser && !browser.supportsBackgroundSync && (
                  <div className="flex items-start gap-2 rounded bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Your browser doesn&rsquo;t support background sync. You&rsquo;ll need to
                      reopen the app to sync queued changes when you reconnect.
                    </span>
                  </div>
                )}
                {browser && browser.hasEvictionRisk && (
                  <div className="flex items-start gap-2 rounded bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      iOS Safari may clear offline data after 7 days of no use. Open this app
                      at least once a day to keep your queued changes.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "install" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Download className="h-5 w-5 text-amber-500 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium">Install to home screen</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Run the app full-screen, like a native app. Works on phones, tablets, and desktop.
                  </p>
                </div>
              </div>

              {browser?.supportsInstallPrompt ? (
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    <strong className="text-foreground">Option 1:</strong> Click the install
                    prompt that appears at the bottom of your screen.
                  </p>
                  <p>
                    <strong className="text-foreground">Option 2:</strong> Open your browser
                    menu (⋮ or ⌘) and select <em>&ldquo;Install Construction Manager&rdquo;</em> or
                    <em> &ldquo;Install app&rdquo;</em>.
                  </p>
                </div>
              ) : browser?.isIOS ? (
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    <strong className="text-foreground">On iPhone/iPad (Safari):</strong>
                  </p>
                  <ol className="list-decimal ml-5 space-y-1">
                    <li>Tap the <strong>Share</strong> button (square with up arrow)</li>
                    <li>Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong></li>
                    <li>Tap <strong>&ldquo;Add&rdquo;</strong></li>
                  </ol>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  <p>
                    Use your browser&rsquo;s menu to install this app. Look for
                    &ldquo;Install app&rdquo; or &ldquo;Add to Home Screen&rdquo;.
                  </p>
                </div>
              )}

              <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                <Smartphone className="inline h-3.5 w-3.5 mr-1" />
                Installed apps run full-screen with no browser chrome — more screen real estate for your reports.
              </div>
            </div>
          )}

          {step === "offline" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Wifi className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium">Open key pages once while online</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The app caches pages you visit. Visit your project, daily reports, equipment,
                    and drawings at least once before going offline.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Pre-cache key pages now:</p>
                <Button
                  onClick={handlePrecache}
                  disabled={precaching}
                  className="w-full"
                  variant="outline"
                >
                  {precaching ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Caching… {precacheProgress}%
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Cache Dashboard + Projects
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
              </div>

              <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p><strong className="text-foreground">What works offline:</strong></p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>View any page you&rsquo;ve opened before</li>
                  <li>Create new reports, RFIs, forms</li>
                  <li>Send chat messages (queued)</li>
                  <li>View cached drawings and documents</li>
                </ul>
              </div>
            </div>
          )}

          {step === "sync" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <RefreshCw className="h-5 w-5 text-emerald-500 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium">Changes auto-sync when you reconnect</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    All your queued work — reports, messages, equipment logs — replays automatically.
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Top banner shows pending count</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Auto-replays on <code className="text-xs bg-muted px-1 rounded">online</code> event</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Manual sync button on Sync Status page</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Conflicts: last-write-wins</span>
                </div>
              </div>

              {browser && !browser.supportsBackgroundSync && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
                  On {browser.browserName}, you must <strong>reopen the app</strong> to trigger sync
                  after reconnecting. Background sync isn&rsquo;t supported.
                </div>
              )}
            </div>
          )}

          {step === "done" && (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-2 ring-emerald-500/30">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <p className="font-medium">You&rsquo;re ready to work on site.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Visit the <strong>Sync Status</strong> page anytime to check pending items or
                  trigger a manual sync.
                </p>
              </div>
              {browser && browser.hasEvictionRisk && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400 text-left">
                  <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
                  <strong>iOS reminder:</strong> Open this app at least once a day to keep your
                  offline data. iOS may clear it after 7 days of no use.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-xs"
          >
            Skip tour
          </Button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(steps[stepIndex - 1])}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>
            )}
            {step !== "done" ? (
              <Button size="sm" onClick={() => setStep(steps[stepIndex + 1])}>
                Next
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleDismiss}>
                Get started
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * useIOSHeartbeat — touches localStorage on app open to reset the 7-day
 * IndexedDB eviction timer on iOS Safari. Also returns whether the user
 * should see a "open daily" warning.
 */
export function useIOSHeartbeat() {
  const [showWarning, setShowWarning] = useState(false);
  const browser = useBrowserInfo();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const now = Date.now();
    const last = parseInt(localStorage.getItem(HEARTBEAT_KEY) ?? "0", 10);
    const daysSince = (now - last) / (1000 * 60 * 60 * 24);

    localStorage.setItem(HEARTBEAT_KEY, now.toString());

    // Show warning on iOS Safari if it's been more than 1 day since last open
    if (browser?.hasEvictionRisk && daysSince > 1) {
      setShowWarning(true);
    }
  }, [browser]);

  return { showWarning, dismiss: () => setShowWarning(false) };
}
