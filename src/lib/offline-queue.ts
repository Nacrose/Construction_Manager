"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";

/**
 * Offline Queue
 *
 * When the user is offline (or the API returns 503 OFFLINE), mutations
 * are stored in IndexedDB. When the network comes back, the queue is
 * replayed in FIFO order.
 *
 * Each queued item contains:
 *  - id: unique UUID
 *  - url: API endpoint (e.g. "/api/trpc/dailyReport.create")
 *  - method: HTTP method
 *  - headers: serialized headers (without auth — added at replay time)
 *  - body: request body (string)
 *  - createdAt: timestamp
 *  - attempts: retry count
 *  - lastError: last error message
 *  - status: pending | syncing | success | failed
 */

export type QueueStatus = "pending" | "syncing" | "success" | "failed";

export interface QueueItem {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  status: QueueStatus;
  /** Human-readable label for UI display */
  label?: string;
  /** Entity type (e.g. "Daily Report", "RFI") */
  entityType?: string;
}

const DB_NAME = "cm-offline";
const DB_VERSION = 1;
const STORE_NAME = "queue";

// ---------- IndexedDB helpers (no external dep) -------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAdd(item: QueueItem): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  notifyListeners();
}

async function dbUpdate(id: string, patch: Partial<QueueItem>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (existing) {
        store.put({ ...existing, ...patch });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  notifyListeners();
}

async function dbRemove(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  notifyListeners();
}

async function dbGetPending(): Promise<QueueItem[]> {
  const db = await openDb();
  const items = await new Promise<QueueItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueueItem[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items
    .filter((i) => i.status === "pending" || i.status === "failed")
    .sort((a, b) => a.createdAt - b.createdAt);
}

async function dbGetAll(): Promise<QueueItem[]> {
  const db = await openDb();
  const items = await new Promise<QueueItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueueItem[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- External store (for React 18 useSyncExternalStore) ----------

const listeners = new Set<() => void>();
let cachedSnapshot: QueueItem[] = [];
let lastReturnedSnapshot: QueueItem[] = [];
let cacheVersion = 0;
let lastReturnedVersion = -1;

function notifyListeners() {
  cacheVersion++;
  dbGetAll().then((items) => {
    cachedSnapshot = items;
    listeners.forEach((l) => l());
  });
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  dbGetAll().then((items) => {
    cachedSnapshot = items;
    callback();
  });
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): QueueItem[] {
  if (lastReturnedVersion !== cacheVersion) {
    lastReturnedSnapshot = cachedSnapshot;
    lastReturnedVersion = cacheVersion;
  }
  return lastReturnedSnapshot;
}

// ---------- Public API ---------------------------------------------------

/**
 * Enqueue a mutation for later replay. Called when the network is
 * unavailable or the server returns 503 OFFLINE.
 */
export async function enqueueMutation(item: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string | null;
  label?: string;
  entityType?: string;
}): Promise<QueueItem> {
  const full: QueueItem = {
    id: crypto.randomUUID(),
    url: item.url,
    method: item.method,
    headers: item.headers ?? { "Content-Type": "application/json" },
    body: item.body ?? null,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    status: "pending",
    label: item.label,
    entityType: item.entityType,
  };
  await dbAdd(full);
  return full;
}

/**
 * Replay all pending mutations in FIFO order.
 *
 * Returns the number of successfully synced items.
 */
export async function replayQueue(): Promise<{ success: number; failed: number; remaining: number }> {
  const pending = await dbGetPending();
  let success = 0;
  let failed = 0;

  for (const item of pending) {
    await dbUpdate(item.id, { status: "syncing" });

    try {
      // v2.0: the httpOnly cf_session cookie rides automatically on the
      // same-origin replay — no credential is stored client-side anymore.
      // A queued mutation replayed after session expiry still hits the
      // 401 path below and is marked failed.
      const headers = new Headers(item.headers);

      const res = await fetch(item.url, {
        method: item.method,
        headers,
        body: item.body,
      });

      if (res.status === 401) {
        // Auth expired — can't recover; mark as failed
        await dbUpdate(item.id, {
          status: "failed",
          lastError: "Authentication expired — please sign in again",
          attempts: item.attempts + 1,
        });
        failed++;
        continue;
      }

      if (res.status >= 400) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error?.message) errorMsg = data.error.message;
        } catch (_) {}
        await dbUpdate(item.id, {
          status: "failed",
          lastError: errorMsg,
          attempts: item.attempts + 1,
        });
        failed++;
        continue;
      }

      // Success — remove from queue
      await dbRemove(item.id);
      success++;
    } catch (err) {
      await dbUpdate(item.id, {
        status: "failed",
        lastError: err instanceof Error ? err.message : String(err),
        attempts: item.attempts + 1,
      });
      failed++;
      // Network dropped mid-replay — stop, will retry on next event
      break;
    }
  }

  const remaining = (await dbGetPending()).length;
  return { success, failed, remaining };
}

/**
 * Remove a single queued item (e.g., user discards a failed item).
 */
export async function discardItem(id: string): Promise<void> {
  await dbRemove(id);
}

/**
 * Clear all queued items (admin action).
 */
export async function clearQueue(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  notifyListeners();
}

/**
 * React hook: subscribes to the queue and exposes:
 *  - items: all queued items (newest first)
 *  - pendingCount: items waiting to sync
 *  - lastError: most recent failed item's error
 *  - replay(): trigger a sync attempt
 *  - isReplaying: true while a sync is in progress
 *  - discard(id): remove a single item
 *  - clear(): empty the entire queue
 */
const EMPTY_QUEUE: QueueItem[] = [];
const getEmptySnapshot = () => EMPTY_QUEUE;

export function useOfflineQueue() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getEmptySnapshot);
  const [isReplaying, setIsReplaying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const replay = useCallback(async () => {
    setIsReplaying(true);
    try {
      const result = await replayQueue();
      if (result.failed > 0) {
        // Find the most recent failed item for the banner
        const pending = await dbGetPending();
        const failedItem = pending.find((i) => i.status === "failed");
        setLastError(failedItem?.lastError ?? "Some items failed to sync");
      } else {
        setLastError(null);
      }
      return result;
    } finally {
      setIsReplaying(false);
    }
  }, []);

  const discard = useCallback(async (id: string) => {
    await discardItem(id);
  }, []);

  const clear = useCallback(async () => {
    await clearQueue();
    setLastError(null);
  }, []);

  // Re-trigger replay when window regains connectivity
  useEffect(() => {
    const onOnline = () => {
      // Small delay to let DNS/routing settle
      setTimeout(() => replay(), 1500);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [replay]);

  const pendingCount = items.filter(
    (i) => i.status === "pending" || i.status === "failed"
  ).length;

  return {
    items,
    pendingCount,
    isReplaying,
    lastError,
    replay,
    discard,
    clear,
  };
}
