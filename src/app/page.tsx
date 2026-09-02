"use client";

import { useEffect, useState } from "react";
import { getToken, fetchWithAuth } from "@/lib/client-auth";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootPage() {
  const [status, setStatus] = useState<"checking" | "ready" | "error">("checking");
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

          // Schema is missing — migrations have not been applied. The old
          // flow tried GET /api/setup here, which could never succeed (the
          // route required an x-setup-secret header a browser never sends)
          // and, even when invoked correctly, applied unversioned runtime
          // DDL. Runtime schema patching is retired: say the command.
          setStatus("error");
          setMessage(
            "Database schema is not applied. An administrator must run: " +
            "npx prisma migrate deploy (see DEPLOY.md)"
          );
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
    return <AppLoadingScreen />;
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef5fc] p-4">
        <div className="max-w-md w-full bg-white border border-[#c7d8e8] shadow-2xl rounded-2xl p-7 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-bold text-slate-900 font-sans">Setup & Initialization Notice</h1>
            <p className="text-xs text-slate-600 font-sans leading-relaxed">{message}</p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            className="amber-cta-btn w-full gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
