"use client";

import { useEffect, useState } from "react";

export type BrowserInfo = {
  isIOS: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isEdge: boolean;
  isFirefox: boolean;
  isAndroid: boolean;
  isStandalone: boolean; // running as installed PWA
  isMacOS: boolean;
  isWindows: boolean;
  browserName: string;
  osName: string;
  supportsBackgroundSync: boolean;
  supportsInstallPrompt: boolean;
  /** IndexedDB may be evicted after 7 days (iOS Safari quirk) */
  hasEvictionRisk: boolean;
};

export function detectBrowser(): BrowserInfo {
  if (typeof window === "undefined") {
    return {
      isIOS: false, isSafari: false, isChrome: false, isEdge: false, isFirefox: false,
      isAndroid: false, isStandalone: false, isMacOS: false, isWindows: false,
      browserName: "Unknown", osName: "Unknown",
      supportsBackgroundSync: false, supportsInstallPrompt: false, hasEvictionRisk: false,
    };
  }

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMacOS = /Macintosh|MacIntel/.test(ua) && !isIOS;
  const isWindows = /Windows/.test(ua);

  // Safari detection (excluding Chrome on iOS which says Safari)
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  const isChrome = /Chrome|CriOS/.test(ua) && !/Edg/.test(ua);
  const isEdge = /Edg/.test(ua);
  const isFirefox = /Firefox|FxiOS/.test(ua);

  // Chromium-based browsers on desktop/Android support Background Sync
  // Safari and Firefox do not
  const supportsBackgroundSync =
    "SyncManager" in window || (isChrome && !isIOS) || (isEdge && !isIOS);

  // Install prompt supported when beforeinstallprompt fires (Chrome, Edge, Samsung)
  const supportsInstallPrompt = (isChrome || isEdge) && !isIOS;

  // Standalone mode (running as installed PWA)
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (isIOS && (navigator as unknown as { standalone?: boolean }).standalone === true);

  // iOS Safari has the 7-day IndexedDB eviction issue
  const hasEvictionRisk = isIOS && isSafari;

  let browserName = "Unknown";
  if (isEdge) browserName = "Edge";
  else if (isChrome) browserName = "Chrome";
  else if (isFirefox) browserName = "Firefox";
  else if (isSafari) browserName = "Safari";

  let osName = "Unknown";
  if (isIOS) osName = "iOS";
  else if (isAndroid) osName = "Android";
  else if (isMacOS) osName = "macOS";
  else if (isWindows) osName = "Windows";

  return {
    isIOS, isSafari, isChrome, isEdge, isFirefox,
    isAndroid, isStandalone, isMacOS, isWindows,
    browserName, osName,
    supportsBackgroundSync, supportsInstallPrompt, hasEvictionRisk,
  };
}

/**
 * useBrowserInfo — returns the detected browser info, but only after mount
 * (so SSR doesn't run navigator checks).
 */
export function useBrowserInfo(): BrowserInfo | null {
  const [info, setInfo] = useState<BrowserInfo | null>(null);
  useEffect(() => {
    setInfo(detectBrowser());
  }, []);
  return info;
}
