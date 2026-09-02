"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster as SonnerToaster } from "sonner";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "@/lib/trpc-client";
import { offlineFetch } from "@/lib/offline-fetch";
import { UserPreferencesProvider } from "@/components/user-preferences-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 60s stale time — avoids refetch on rapid navigation
            staleTime: 60_000,
            // Disable window-focus refetch: prevents all queries from
            // firing simultaneously when returning to the tab after idle,
            // which can overwhelm the local DB connection and freeze navigation.
            refetchOnWindowFocus: false,
            // 2 retries with exponential back-off (500ms, 1000ms)
            retry: 2,
            retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 10_000),
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          // v2.0: cookie-authenticated — the browser attaches the httpOnly
          // cf_session cookie to every same-origin request automatically.
          // No Authorization header, no credential in client JS.
          //
          // Use our offline-aware fetch wrapper so mutations are queued
          // when the network is unavailable.
          fetch: offlineFetch as typeof fetch,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <UserPreferencesProvider>
          {children}
        </UserPreferencesProvider>
        <SonnerToaster richColors position="top-right" duration={3000} closeButton />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

