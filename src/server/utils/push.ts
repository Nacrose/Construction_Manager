/**
 * Web Push notification utilities.
 *
 * Uses the web-push library (install with: npm install web-push).
 *
 * To enable push notifications:
 * 1. Generate VAPID keys:
 *    npx web-push generate-vapid-keys
 *
 * 2. Add to your .env file:
 *    VAPID_PUBLIC_KEY=BG3...your-public-key
 *    VAPID_PRIVATE_KEY=abc...your-private-key
 *    VAPID_SUBJECT=mailto:admin@yourcompany.com
 *
 * 3. Apply migrations (PushSubscription table):
 *    npx prisma migrate deploy
 *
 * 4. The client subscribes via the "Enable notifications" button
 *    (see NotificationPermission component)
 *
 * 5. Server sends notifications via sendPushNotification() or
 *    sendPushToUser() — called from notify.ts when creating notifications
 */

import { db } from "@/lib/db";

// VAPID keys from environment
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@construction-manager.app";

/**
 * Check if push notifications are configured (VAPID keys present).
 */
export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

/**
 * Get the public VAPID key for client-side subscription.
 * Returns null if not configured.
 */
export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY ?? null;
}

/**
 * Lazily import web-push (avoids requiring it at module load if
 * push is not configured).
 *
 * Note: web-push is an optional dependency. If not installed, push
 * notifications simply won't work — the app continues normally.
 * Install with: npm install web-push
 */
async function getWebPush(): Promise<any | null> {
  if (!isPushConfigured()) return null;
  try {
    // Dynamic require to avoid build failure if web-push is not installed
    const webpush = (await import(/* webpackIgnore: true */ "web-push" as any)).default
      ?? (await import(/* webpackIgnore: true */ "web-push" as any));
    if (webpush?.setVapidDetails) {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
      return webpush;
    }
    return null;
  } catch {
    // web-push not installed — push notifications disabled
    return null;
  }
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string; // URL to open when clicked
  tag?: string; // grouping tag (replaces existing with same tag)
  icon?: string; // icon URL
  data?: Record<string, unknown>;
};

// ── SSRF GUARD (audit H-3) ─────────────────────────────────────────────
// The push endpoint is a client-supplied URL that web-push later POSTs to
// from the SERVER. Without validation, a stored endpoint like
// http://169.254.169.254/latest/meta-data turned every notification into a
// server-side request we cannot see (cloud metadata / internal services).
// Web Push endpoints only ever come from the platform push services, so a
// strict https+host allowlist is both safe and complete here.
const PUSH_HOST_ALLOWLIST = [
  "fcm.googleapis.com", // Chrome / Android (FCM)
  "push.services.mozilla.com", // Firefox autopush
  "push.apple.com", // Safari (WN, e.g. web.push.apple.com)
  "notify.windows.com", // Edge / Chromium on Windows (wns2-*.notify.windows.com)
];

/**
 * Validate a push subscription endpoint before it is stored or used.
 * - https only, no credentials, no non-standard port, ≤2048 chars
 * - host must be (a subdomain of) a known platform push service
 */
export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_ALLOWLIST.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * Send a push notification to a single subscription.
 */
async function sendToSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}, payload: PushPayload): Promise<boolean> {
  // SSRF guard (audit H-3): also enforced at save time, but stored rows
  // written before that fix must never be sent to either.
  if (!isAllowedPushEndpoint(sub.endpoint)) return false;
  const webpush = await getWebPush();
  if (!webpush) return false;

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (err: any) {
    // 410 = subscription expired/gone — delete it
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      await db.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
    }
    return false;
  }
}

/**
 * Send a push notification to all devices belonging to a user.
 *
 * Returns the number of successfully delivered notifications.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!isPushConfigured()) return 0;

  const subs = await db.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  });

  if (subs.length === 0) return 0;

  const results = await Promise.allSettled(
    subs.map((s) => sendToSubscription(s, payload))
  );

  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}

/**
 * Save a push subscription for the current user.
 * Called from the client when the browser grants permission and creates
 * a subscription.
 */
export async function savePushSubscription(
  userId: string,
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  userAgent?: string
): Promise<void> {
  // SSRF guard (audit H-3): reject non-push-service endpoints before they
  // ever reach the DB.
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    throw new Error("Push endpoint is not an allowed push service");
  }
  await db.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent ?? null,
    },
    update: {
      userId, // re-assign if endpoint moved to a different user
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent ?? null,
    },
  });
}

/**
 * Remove a push subscription (when user disables notifications or
 * subscription expires). Scopes the delete to the calling user so a
 * user cannot delete another user's subscription by knowing the endpoint.
 */
export async function removePushSubscription(
  endpoint: string,
  userId: string
): Promise<void> {
  await db.pushSubscription
    .deleteMany({ where: { endpoint, userId } })
    .catch(() => {});
}
