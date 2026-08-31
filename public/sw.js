/**
 * Construction Manager — Service Worker
 *
 * Strategy:
 *  - App shell (HTML/JS/CSS/static assets): stale-while-revalidate
 *  - tRPC GET queries (read endpoints): cache-first with timeout fallback to cache
 *  - tRPC POST mutations: NEVER cached — must hit the server
 *  - Uploaded photos / images: cache-first with limited TTL
 *  - Offline form queue: handled at app level (IndexedDB), not by SW
 *
 * When the user is offline and tries to navigate to a page they haven't
 * visited, SW falls back to /offline (a minimal cached page).
 */

const VERSION = "v1.0.0";
const SHELL_CACHE = `cm-shell-${VERSION}`;
const DATA_CACHE = `cm-data-${VERSION}`;
const IMG_CACHE = `cm-img-${VERSION}`;
const PRECACHE = `cm-precache-${VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/dashboard",
  "/offline",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

// Install: precache the offline fallback + critical icons
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // best-effort precache — ignore failures (e.g. dev server not ready)
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-cache" });
            if (res.ok) await cache.put(url, res.clone());
          } catch (_) {
            /* ignore */
          }
        })
      );
      self.skipWaiting();
    })()
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, DATA_CACHE, IMG_CACHE, PRECACHE].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Helper: detect if a request is a tRPC query (GET) vs mutation (POST)
function isTrpcGetRequest(url, method) {
  return url.includes("/api/trpc") && method === "GET";
}

function isTrpcMutationRequest(url, method) {
  return url.includes("/api/trpc") && method !== "GET";
}

function isStaticAsset(url) {
  return (
    url.startsWith(self.location.origin) &&
    (url.includes("/_next/static/") ||
      url.endsWith(".js") ||
      url.endsWith(".css") ||
      url.endsWith(".woff") ||
      url.endsWith(".woff2") ||
      url.endsWith(".svg") ||
      url.endsWith(".png") ||
      url.endsWith(".ico"))
  );
}

function isImageRequest(url) {
  if (!url.startsWith(self.location.origin)) return false;
  return (
    url.includes("/api/drawings/") ||
    url.includes("/api/documents/") ||
    url.includes("/uploads/") ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(url)
  );
}

// Stale-while-revalidate for shell assets
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

// Network-first for HTML navigations. Never cache authenticated user/admin HTML.
async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch (_) {
    const offlinePage = await caches.match("/offline");
    if (offlinePage) return offlinePage;
    return new Response(
      "<!doctype html><html><head><meta charset='utf-8'><title>Offline</title></head>" +
        "<body style='font-family:system-ui;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>" +
        "<div style='text-align:center'><h1>You are offline</h1>" +
        "<p>Connect to the internet and try again.</p></div></body></html>",
      { status: 503, headers: { "Content-Type": "text/html" } }
    );
  }
}

// Pass-through for tRPC queries (React Query manages in-memory caching securely).
// Never persist authenticated JSON data to Service Worker storage.
async function handleTrpcQuery(request) {
  try {
    return await fetch(request);
  } catch (_) {
    return new Response(
      JSON.stringify({ error: { message: "offline", code: "OFFLINE" } }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Mutations: always pass through to network. If offline, return 503
// and let the app queue it in IndexedDB.
async function handleMutation(request) {
  try {
    return await fetch(request);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: "offline", code: "OFFLINE" } }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Image cache: cache-first, unlimited (large photos)
async function handleImage(request) {
  const cache = await caches.open(IMG_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return new Response("", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip Next.js HMR and dev-only paths
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // Navigations (HTML pages)
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // tRPC mutations — never cache
  if (isTrpcMutationRequest(url.pathname, request.method)) {
    event.respondWith(handleMutation(request));
    return;
  }

  // tRPC GET queries
  if (isTrpcGetRequest(url.pathname, request.method)) {
    event.respondWith(handleTrpcQuery(request));
    return;
  }

  // Auth endpoints — never cache
  if (url.pathname.startsWith("/api/auth/")) return;

  // Other /api/ endpoints (upload, download, etc.) — pass through
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(handleMutation(request));
    return;
  }

  // Static assets — stale-while-revalidate
  if (isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // Images
  if (isImageRequest(url.pathname)) {
    event.respondWith(handleImage(request));
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((r) => r || Response.error()))
  );
});

// Listen for messages from the client (e.g., "SKIP_WAITING" to activate new SW)
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// Periodic sync: replay queued mutations when triggered
self.addEventListener("sync", (event) => {
  if (event.tag === "cm-replay-queue") {
    event.waitUntil(
      self.clients.matchAll().then((clients) =>
        clients.forEach((c) => c.postMessage({ type: "REPLAY_QUEUE" }))
      )
    );
  }
});

// Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Construction Manager", body: event.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "cm-notification",
    data: {
      url: payload.url || "/dashboard",
      ...payload.data,
    },
    actions: payload.url ? [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ] : undefined,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Construction Manager", options)
  );
});

// Notification click handler — open the app and focus/navigate
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing window if one is open
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: "NAVIGATE", url: targetUrl });
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(targetUrl);
    })
  );
});
