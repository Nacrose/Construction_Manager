"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bell, BellOff, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchWithAuth, getToken } from "@/lib/client-auth";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

/**
 * NotificationPermission — lets users enable/disable push notifications.
 *
 * Shows the current permission state and provides a button to:
 *  1. Request notification permission from the browser
 *  2. Subscribe to push via the Service Worker
 *  3. Send the subscription to the server
 *
 * If VAPID keys are not configured on the server, shows a message
 * explaining that push is not yet available.
 */
export function NotificationPermission() {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [pushConfigured, setPushConfigured] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check browser support
    if (!("Notification" in window) || !("serviceWorker" in window) || !("PushManager" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermissionState);

    // Check if server has VAPID keys
    fetch("/api/push/vapid-public-key")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.configured) {
          setPushConfigured(true);
          // Check if already subscribed
          navigator.serviceWorker.ready.then((reg) => {
            return reg.pushManager.getSubscription();
          }).then((sub) => {
            setSubscribed(!!sub);
          }).catch(() => {});
        } else {
          setPushConfigured(false);
        }
      })
      .catch(() => setPushConfigured(false));
  }, []);

  async function handleEnable() {
    setLoading(true);
    try {
      // 1. Request permission
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      if (result !== "granted") {
        toast.error("Notification permission denied");
        setLoading(false);
        return;
      }

      // 2. Get VAPID public key
      const vapidRes = await fetch("/api/push/vapid-public-key");
      const vapidData = await vapidRes.json();
      if (!vapidData.publicKey) {
        toast.error("Push not configured on server");
        setLoading(false);
        return;
      }

      // 3. Subscribe via Service Worker
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey) as unknown as BufferSource,
      });

      // 4. Send subscription to server
      const subJson = subscription.toJSON();
      const token = getToken();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(subJson),
      });

      if (res.ok) {
        setSubscribed(true);
        toast.success("Push notifications enabled");
      } else {
        toast.error("Failed to save subscription");
      }
    } catch (err) {
      toast.error("Could not enable notifications: " + (err instanceof Error ? err.message : ""));
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        // Notify server
        const token = getToken();
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ endpoint }),
        });
      }
      setSubscribed(false);
      toast.success("Push notifications disabled");
    } catch (err) {
      toast.error("Could not disable: " + (err instanceof Error ? err.message : ""));
    } finally {
      setLoading(false);
    }
  }

  // Browser doesn't support push
  if (permission === "unsupported") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BellOff className="h-4 w-4" />
            Push Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your browser doesn&rsquo;t support push notifications. Use Chrome, Edge, or Firefox
            for the best experience.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Server doesn't have VAPID keys
  if (pushConfigured === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BellOff className="h-4 w-4" />
            Push Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Push notifications are not yet configured on this server. An administrator
            needs to generate VAPID keys and add them to the environment variables.
          </p>
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">Setup instructions</summary>
            <pre className="mt-2 p-3 rounded bg-muted overflow-x-auto">
{`# 1. Install web-push
npm install web-push

# 2. Generate VAPID keys
npx web-push generate-vapid-keys

# 3. Add to .env
VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
VAPID_SUBJECT=mailto:admin@yourcompany.com`}
            </pre>
          </details>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (pushConfigured === null) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          Get notified about new messages, RFI assignments, and IPC approvals — even when the app is closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {subscribed ? (
              <>
                <Check className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">Enabled</span>
              </>
            ) : permission === "denied" ? (
              <>
                <X className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium">Blocked</span>
              </>
            ) : (
              <>
                <BellOff className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Not enabled</span>
              </>
            )}
          </div>
          {subscribed ? (
            <Button size="sm" variant="outline" onClick={handleDisable} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Disable
            </Button>
          ) : permission === "denied" ? (
            <p className="text-xs text-muted-foreground">
              Enable in browser settings
            </p>
          ) : (
            <Button size="sm" onClick={handleEnable} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Bell className="h-3.5 w-3.5 mr-1" />}
              Enable
            </Button>
          )}
        </div>
        {permission === "denied" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            You&rsquo;ve blocked notifications in your browser. To enable, click the lock icon
            in your address bar and allow notifications for this site.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Convert a base64 URL string to a Uint8Array (for VAPID key).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
