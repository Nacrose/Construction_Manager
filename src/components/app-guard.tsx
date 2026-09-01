"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPiP } from "@/components/chat-pip";
import { OnboardingModal } from "@/components/onboarding-modal";
import { getToken, clearAuth, fetchWithAuth } from "@/lib/client-auth";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { SiteTelemetryTicker } from "@/components/site-telemetry-ticker";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { CommandPalette } from "@/components/command-palette";

export function AppGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "authed" | "unauthed">(() => {
    if (typeof window === "undefined") return "loading";
    const token = getToken();
    return token ? "authed" : "unauthed";
  });

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setState("unauthed");
      window.location.href = "/login";
      return;
    }

    const timeout = setTimeout(() => {
      if (!cancelled) {
        clearAuth();
        setState("unauthed");
        window.location.href = "/login";
      }
    }, 10000);

    async function check() {
      try {
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
