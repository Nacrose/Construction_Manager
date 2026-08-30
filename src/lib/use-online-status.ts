"use client";

import { useEffect, useState, useRef } from "react";

/**
 * useOnlineStatus — returns true when the browser has network connectivity.
 *
 * Strategy:
 * 1. Use navigator.onLine as the initial signal (fast, but unreliable)
 * 2. Listen to online/offline events for immediate updates
 * 3. Periodically ping our own API to verify REAL connectivity
 *    (navigator.onLine can be false even when we can reach the server,
 *    e.g. behind corporate proxies, VPNs, or the z.ai gateway)
 *
 * The real ping is the source of truth — if we can reach /api/auth/me
 * (even with a 401), we're online. navigator.onLine just triggers
 * faster UI updates.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const pingInFlight = useRef(false);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      // Verify with a real ping
      pingServer();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Real connectivity check — ping our own API
    async function pingServer() {
      if (pingInFlight.current) return;
      pingInFlight.current = true;
      try {
        // Use a short timeout — if the server doesn't respond in 5s,
        // consider ourselves offline
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch("/api/auth/me", {
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeout);
        // Any HTTP response (even 401) means we're online
        setOnline(true);
      } catch {
        // Network error — we're truly offline
        setOnline(false);
      } finally {
        pingInFlight.current = false;
      }
    }

    // Initial ping (don't trust navigator.onLine alone)
    pingServer();

    // Poll every 30 seconds with a real ping
    const interval = setInterval(pingServer, 30_000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, []);

  return online;
}
