"use client";

import { useEffect, useState } from "react";
import { getUser, type ClientUser } from "@/lib/client-auth";

/**
 * Reactive current-user hook. Re-renders whenever auth state changes
 * (login, logout, or impersonation start/stop) via the `cf:auth-change`
 * event dispatched by setAuth/clearAuth in client-auth.ts.
 */
export function useAuthUser(): ClientUser | null {
  const [user, setUser] = useState<ClientUser | null>(() =>
    typeof window !== "undefined" ? getUser() : null,
  );

  useEffect(() => {
    const onAuthChange = () => setUser(getUser());
    window.addEventListener("cf:auth-change", onAuthChange);
    return () => window.removeEventListener("cf:auth-change", onAuthChange);
  }, []);

  return user;
}
