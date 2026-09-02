"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPiP } from "@/components/chat-pip";
import { OnboardingModal } from "@/components/onboarding-modal";
import { clearAuth, fetchWithAuth } from "@/lib/client-auth";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { SiteTelemetryTicker } from "@/components/site-telemetry-ticker";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { CommandPalette } from "@/components/command-palette";

export function AppGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  // SECURITY: nothing in client JS can prove a session exists anymore (the
  // credential is the httpOnly cookie, invisible to scripts) — stay
  // "loading" (children unmounted) until /api/auth/me validates the cookie
  // against the DB. This preserves the v1.1 guarantee: no module queries
  // fire until the session is real.
  const [state, setState] = useState<"loading" | "authed" | "unauthed">("loading");

  useEffect(() => {
    let cancelled = false;

    const timeout = setTimeout(() => {
      if (!cancelled) {
        clearAuth();
        setState("unauthed");
        window.location.href = "/login";
      }
    }, 10000);

    async function check() {
      try {
        // Cookie rides automatically on the same-origin request.
        const res = await fetchWithAuth("/api/auth/me");
        if (cancelled) return;
        clearTimeout(timeout);
        if (res.ok) {
          setState("authed");
        } else {
          clearAuth();
          setState("unauthed");
          window.location.href = "/login";
        }
      } catch {
        if (cancelled) return;
        clearTimeout(timeout);
        // Network failure ≠ unauthenticated. The edge proxy (proxy.ts) has
        // already gated this page on a valid cf_session JWT before the HTML
        // could load, so the session is present — a thrown fetch here is a
        // transport problem (offline, dev server restart). Trust the proxy
        // gate, surface the app, and let error boundaries + offline handling
        // do their job. (Pre-v2.0 this branch trusted a localStorage token;
        // the proxy validation is the strictly stronger anchor.)
        setState("authed");
      }
    }

    check();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [router]);

  if (state === "loading") {
    return <AppLoadingScreen />;
  }

  if (state === "unauthed") {
    return null;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-[#eef5fc] relative z-10">
      {/* Permanent Left Sidebar */}
      <AppSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Telemetry & Status Ticker */}
        <SiteTelemetryTicker />

        {/* Impersonation banner (shown only while a superadmin is impersonating) */}
        <ImpersonationBanner />

        {/* Full-screen scrollable main container */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="mx-auto w-full max-w-[1920px]">
            {children}
          </div>
        </main>
      </div>

      {/* Global Command Palette [Cmd+K] */}
      <CommandPalette />

      {/* Floating chat */}
      <ChatPiP />

      {/* Onboarding modal */}
      <OnboardingModal />
    </div>
  );
}
