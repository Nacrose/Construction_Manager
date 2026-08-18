"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppDock } from "@/components/app-dock";
import { ChatPiP } from "@/components/chat-pip";
import { OnboardingModal } from "@/components/onboarding-modal";
import { getToken, clearAuth, fetchWithAuth } from "@/lib/client-auth";

/**
 * AppGuard — client-side route protection for the (app) route group.
 *
 * Performance: If a token is already present in localStorage, we render
 * the app shell IMMEDIATELY and verify the token in the background.
 * If verification fails, we redirect to /login then. This eliminates
 * the "blank spinner" delay on every page navigation for authed users.
 *
 * Security notes:
 * - If no token is found (or background verification fails), the user
 *   is redirected to /login.
 * - There is NO auto-login fallback.
 * - Client-side guarding is convenience only. Server-side enforcement
 *   lives in the API routes and tRPC routers via src/lib/auth.ts and
 *   src/lib/authz.ts.
 */
import { SiteTelemetryTicker } from "@/components/site-telemetry-ticker";
import { CommandPalette } from "@/components/command-palette";

export function AppGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "authed" | "unauthed">(
    () => (typeof window !== "undefined" && getToken() ? "authed" : "loading")
  );

  useEffect(() => {
    let cancelled = false;

    // Safety timeout: never stay in loading state longer than 2.5s
    const timeout = setTimeout(() => {
      if (cancelled) return;
      const token = getToken();
      if (token) {
        setState("authed");
      } else {
        setState("unauthed");
        window.location.href = "/login";
      }
    }, 2500);

    async function check() {
      const token = getToken();

      if (!token) {
        if (!cancelled) {
          clearTimeout(timeout);
          setState("unauthed");
          window.location.href = "/login";
        }
        return;
      }

      try {
        const res = await fetchWithAuth("/api/auth/me");
        if (cancelled) return;
        clearTimeout(timeout);
        if (res.ok || res.status === 503) {
          setState("authed");
        } else if (res.status === 401 || res.status === 403) {
          clearAuth();
          setState("unauthed");
          window.location.href = "/login";
        } else {
          // Other responses (e.g. 500), keep authed for offline resiliency
          setState("authed");
        }
      } catch {
        if (cancelled) return;
        clearTimeout(timeout);
        // If network error, still allow authed state if token exists
        if (getToken()) {
          setState("authed");
        } else {
          setState("unauthed");
          window.location.href = "/login";
        }
      }
    }

    check();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [router]);

  if (state === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent shadow-[0_0_12px_#00ff66]" />
          <p className="text-xs font-mono text-primary">INITIALIZING MATRIX OS…</p>
        </div>
      </div>
    );
  }

  if (state === "unauthed") {
    return null;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-transparent relative z-10">
      {/* Top Telemetry & Status Ticker */}
      <SiteTelemetryTicker />

      {/* Floating command dock */}
      <AppDock />

      {/* Full-screen scrollable content area */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1920px] px-3 sm:px-5 lg:px-6 py-4 pb-24">
          {children}
        </div>
      </main>

      {/* Global Command Palette [Cmd+K] */}
      <CommandPalette />

      {/* Floating chat */}
      <ChatPiP />

      {/* Onboarding modal */}
      <OnboardingModal />
    </div>
  );
}
