"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X, Globe, Apple, Clock } from "lucide-react";
import { useBrowserInfo } from "@/lib/browser-detect";

const DISMISS_KEY = "cm-browser-warning-dismissed";

/**
 * BrowserWarningBanner — shows contextual warnings about browser
 * limitations:
 *  - iOS Safari: no Background Sync + 7-day IndexedDB eviction risk
 *  - Firefox: no Background Sync
 *  - Not installed: gentle reminder
 *
 * Dismissable per browser session. Re-shows after 7 days.
 */
export function BrowserWarningBanner() {
  const browser = useBrowserInfo();
  const [show, setShow] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(DISMISS_KEY);
    if (stored) {
      const ts = parseInt(stored, 10);
      setDismissedAt(ts);
      // Re-show after 7 days
      if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(DISMISS_KEY);
        setDismissedAt(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!browser || dismissedAt) {
      setShow(false);
      return;
    }

    // Show warning if:
    // 1. iOS Safari — eviction risk + no background sync
    // 2. Firefox — no background sync
    // 3. Not installed (but install is supported) — gentle nudge, only on dashboard
    const shouldShow =
      browser.hasEvictionRisk ||
      (browser.isFirefox && !browser.isIOS) ||
      (!browser.isStandalone && browser.supportsInstallPrompt && window.location.pathname === "/dashboard");

    setShow(shouldShow);
  }, [browser, dismissedAt]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setDismissedAt(Date.now());
    setShow(false);
  }

  if (!show || !browser) return null;

  let icon = <AlertTriangle className="h-4 w-4" />;
  let message = "";
  let action = "";

  if (browser.hasEvictionRisk) {
    icon = <Apple className="h-4 w-4" />;
    message =
      "You're using Safari on iOS — offline changes won't auto-sync when the app is closed, and iOS may clear offline data after 7 days. Open this app daily.";
    action = "Use Chrome on Android/desktop for best experience.";
  } else if (browser.isFirefox && !browser.isIOS) {
    icon = <AlertTriangle className="h-4 w-4" />;
    message =
      "Firefox doesn't support Background Sync — you'll need to reopen the app to sync queued changes after reconnecting.";
    action = "For auto-sync, use Chrome or Edge.";
  } else if (!browser.isStandalone && browser.supportsInstallPrompt) {
    icon = <Globe className="h-4 w-4" />;
    message = "Install this app to your home screen for full-screen, offline access.";
    action = "Tap the install prompt or use your browser menu.";
  }

  return (
    <div className="sticky top-0 z-30 w-full border-b border-amber-500/30 bg-amber-500/10 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs">
        <span className="text-amber-600 dark:text-amber-400">{icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-amber-800 dark:text-amber-300">{message}</span>
          {action && (
            <span className="ml-1 text-amber-600/80 dark:text-amber-400/80 hidden sm:inline">
              {action}
            </span>
          )}
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded p-1 text-amber-600/60 hover:bg-amber-500/20 hover:text-amber-700 dark:text-amber-400/60 dark:hover:text-amber-300"
          aria-label="Dismiss warning"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * IOSHeartbeatWarning — daily reminder for iOS Safari users to open the app.
 * Shows only if it's been > 1 day since last open.
 */
export function IOSHeartbeatWarning() {
  const browser = useBrowserInfo();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!browser?.hasEvictionRisk) return;
    const HEARTBEAT_KEY = "cm-last-heartbeat";
    const last = parseInt(localStorage.getItem(HEARTBEAT_KEY) ?? "0", 10);
    const daysSince = (Date.now() - last) / (1000 * 60 * 60 * 24);
    if (daysSince > 1) setShow(true);
    // Update heartbeat
    localStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
  }, [browser]);

  if (!show) return null;

  return (
    <div className="sticky top-0 z-30 w-full border-b border-blue-500/30 bg-blue-500/10 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs">
        <Clock className="h-4 w-4 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-blue-800 dark:text-blue-300">
            Welcome back — it&rsquo;s been a while. iOS may clear your offline data if you don&rsquo;t
            open this app regularly. All caught up now.
          </span>
        </div>
        <button
          onClick={() => setShow(false)}
          className="shrink-0 rounded p-1 text-blue-500/60 hover:bg-blue-500/20 hover:text-blue-700"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
