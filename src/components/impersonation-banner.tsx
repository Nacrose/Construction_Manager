"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { useAuthUser } from "@/lib/use-auth-user";
import { getToken, setAuth } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";

/**
 * Global banner shown while a superadmin is impersonating a tenant org.
 * Exiting calls the admin.stopImpersonation procedure and restores the
 * real admin session context.
 */
export function ImpersonationBanner() {
  const user = useAuthUser();
  const router = useRouter();
  const stop = trpc.admin.stopImpersonation.useMutation({
    onSuccess: (data) => {
      const token = getToken();
      if (token && data.user) setAuth(token, data.user);
      toast.success("Stopped impersonation");
      router.push("/admin");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!user?.impersonating) return null;

  const orgName = user.impersonatedOrg?.name ?? "organization";

  return (
    <div className="flex items-center justify-center gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-amber-100">
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
      <span className="text-sm">
        <span className="font-semibold">Impersonating</span>{" "}
        <span className="font-bold">{orgName}</span>
        {user.impersonatedReason ? (
          <span className="text-amber-200/80"> — {user.impersonatedReason}</span>
        ) : null}
        <span className="ml-2 text-amber-200/60">(all actions are audit-logged)</span>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="ml-2 border-amber-400/50 text-amber-100 hover:bg-amber-500/20"
        onClick={() => stop.mutate()}
        disabled={stop.isPending}
      >
        {stop.isPending ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <LogOut className="mr-1 h-3.5 w-3.5" />
        )}
        Exit
      </Button>
    </div>
  );
}
