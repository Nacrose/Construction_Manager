"use client";

import { useEffect, useState } from "react";
import { getToken, fetchWithAuth } from "@/lib/client-auth";

export default function RootPage() {
  const [status, setStatus] = useState<"checking" | "setting-up" | "ready" | "error">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const token = getToken();
        if (token) {
          try {
            const authRes = await fetchWithAuth("/api/auth/me");
            if (authRes.ok) {
              setStatus("ready");
              window.location.href = "/dashboard";
              return;
            }
          } catch {
            // Proceed to check public endpoint
          }
        }

        // Check if the database is set up by calling /api/auth/me
        const checkRes = await fetch("/api/auth/me");
        if (checkRes.status === 200) {
          setStatus("ready");
          window.location.href = "/dashboard";
          return;
        }

        if (checkRes.status === 401) {
          // Database is ready, user needs to login
          setStatus("ready");
          window.location.href = "/login";
          return;
        }

        // If we get a 500 (table doesn't exist), check if it's a schema
        // error (not just any DB failure) before running setup
        if (checkRes.status === 500) {
          let errorBody = "";
          try { errorBody = (await checkRes.json())?.error ?? ""; } catch {}
          // Only trigger setup for schema-missing errors, not random DB failures
          const isSchemaError = errorBody.includes("relation") ||
            errorBody.includes("does not exist") ||
            errorBody.includes("column") ||
            errorBody.includes("table");
          if (!isSchemaError) {
            setStatus("error");
            setMessage("Database error: " + errorBody.slice(0, 200));
            return;
          }

          setStatus("setting-up");
          setMessage("Setting up database for the first time…");

          const setupRes = await fetch("/api/setup");
          const setupData = await setupRes.json();

          // In production, setup may require a secret (403)
          if (setupRes.status === 403) {
            setStatus("error");
            setMessage(
              "Database needs setup. An administrator must run: " +
              "curl /api/setup?secret=SETUP_SECRET " +
              "(set SETUP_SECRET in your environment variables)"
            );
            return;
          }

          if (setupData.error) {
            setStatus("error");
            setMessage(setupData.error);
            return;
          }

          // Setup succeeded — go to login
          setStatus("ready");
          window.location.href = "/login";
          return;
        }

        // Any other response — go to login
        setStatus("ready");
        window.location.href = "/login";
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Failed to initialize");
      }
    }
    init();
  }, []);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-radial">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="mt-3 text-sm text-white/70">Loading Construction Manager…</p>
        </div>
      </div>
    );
  }

  if (status === "setting-up") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-radial">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="mt-3 text-sm text-white/70">{message}</p>
          <p className="mt-1 text-xs text-white/40">This only happens once.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-radial p-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-amber-400">Setup Error</h1>
          <p className="mt-2 text-sm text-white/70">{message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-amber-gradient px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}
