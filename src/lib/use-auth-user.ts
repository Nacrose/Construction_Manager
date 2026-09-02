"use client";

import { useEffect, useState } from "react";
import { getUser, type ClientUser } from "@/lib/client-auth";

/**
 * Reactive current-user hook. Re-renders whenever auth state changes
 * (login, logout, or impersonation start/stop) via the `cf:auth-change`
 * event dispatched by setAuthUser/clearAuth in client-auth.ts — and via the
 * cross-tab `storage` event: since v2.0 the identity cache (`cf_user`) is
 * the only client-side auth state, so logging out in one tab now drops the
 * identity in every open tab. (The credential itself is the httpOnly
 * cookie; once the server session is revoked a stale tab can do nothing —
 * this hook just fixes the stale UI and bounces it to /login.)
 */
export function useAuthUser(): ClientUser | null {
  const [user, setUser] = useState<ClientUser | null>(() =>
    typeof window !== "undefined" ? getUser() : null,
  );

  useEffect(() => {
    const onAuthChange = () => setUser(getUser());
    const onStorage = (e: StorageEvent) => {
      // e.key === null → another tab called localStorage.clear().
      // e.key === "cf_user" → login / logout / impersonation in another tab.
      if (e.key === null || e.key === "cf_user") {
        const next = getUser();
        setUser(next);
        // Cross-tab logout: the identity is gone — follow it to /login.
        if (next === null) {
          window.location.href = "/login";
        }
      }
    };
    window.addEventListener("cf:auth-change", onAuthChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("cf:auth-change", onAuthChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return user;
}
