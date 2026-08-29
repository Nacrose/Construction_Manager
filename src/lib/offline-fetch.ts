"use client";

import { enqueueMutation } from "@/lib/offline-queue";

/**
 * offlineFetch — a fetch wrapper that detects offline state and tRPC
 * mutation requests, and enqueues them in IndexedDB instead of failing.
 *
 * Behavior:
 *  1. If the request is a GET (or non-mutation), pass through normally.
 *  2. If the request is a tRPC mutation (POST to /api/trpc/...):
 *     a. If online → try the request. If it fails or returns 503 OFFLINE,
 *        enqueue it and return a synthetic "queued" response.
 *     b. If offline → enqueue immediately, return synthetic response.
 *  3. Other POST/PUT/DELETE → try, on failure enqueue and return queued.
 *
 * The synthetic response has the shape of a tRPC v11 response so that
 * mutation hooks treat it as success.
 */

const TRPC_ENDPOINT = "/api/trpc";

interface TrpcBatchItem {
  json: unknown;
}

interface TrpcBatchRequest {
  [batchIndex: string]: TrpcBatchItem;
}

/**
 * Parse a tRPC mutation URL like "/api/trpc/dailyReport.create" to extract
 * the procedure name. Returns null if not a mutation procedure.
 */
function parseTrpcMutationUrl(url: string): string[] | null {
  try {
    const u = new URL(url, window.location.origin);
    if (!u.pathname.startsWith(TRPC_ENDPOINT)) return null;
    const after = u.pathname.slice(TRPC_ENDPOINT.length + 1);
    // The path may contain comma-separated procedures (batched)
    return after.split(",").filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Synthesize a tRPC v11 success response for batched mutations.
 * Each item gets `{ result: { data: { json: { _queued: true } } } }`.
 */
function makeQueuedResponse(procedureNames: string[] | null): Response {
  const body: Record<string, { result: { data: { json: { _queued: true; queuedAt: number; procedure?: string } } } }> = {};
  if (procedureNames && procedureNames.length > 0) {
    procedureNames.forEach((name, idx) => {
      body[idx] = {
        result: {
          data: {
            json: { _queued: true, queuedAt: Date.now(), procedure: name },
          },
        },
      };
    });
  } else {
    body[0] = {
      result: { data: { json: { _queued: true, queuedAt: Date.now() } } },
    };
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Determine if a response is the SW's "offline" stub.
 */
async function isOfflineResponse(res: Response): Promise<boolean> {
  if (res.status !== 503) return false;
  try {
    const clone = res.clone();
    const data = await clone.json();
    return data?.error?.code === "OFFLINE";
  } catch {
    return false;
  }
}

/**
 * Try to extract a human-readable label for the queue item from the body.
 * This is best-effort — for tRPC mutations, the body shape is
 * `{"0":{"json":{...}}}`.
 */
function extractLabel(url: string, body: string | null): { label?: string; entityType?: string } {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body) as TrpcBatchRequest;
    const first = parsed["0"]?.json as Record<string, unknown> | undefined;
    if (!first) return {};

    // Extract entity type from URL
    const procName = parseTrpcMutationUrl(url)?.[0] ?? "";
    const parts = procName.split(".");
    const routerName = parts[0] ?? "";
    const actionName = parts[1] ?? "";

    // Map router → entity type
    const entityMap: Record<string, string> = {
      dailyReport: "Daily Report",
      rfi: "RFI",
      ipc: "IPC",
      boq: "BOQ Entry",
      drawing: "Drawing",
      correspondence: "Correspondence",
      equipment: "Equipment",
      chat: "Message",
      submittal: "Submittal",
      punchList: "Punch List",
      material: "Material",
      projectOps: "Meeting",
      hr: "HR Record",
    };

    const entityType = entityMap[routerName] ?? routerName;
    const verb = actionName === "create" ? "New" : actionName === "update" ? "Update" : "";
    const label = `${verb} ${entityType}`.trim();

    // Try to get a more specific label
    if (first.number) return { label: `${label} #${first.number}`, entityType };
    if (first.title) return { label: `${label}: ${first.title}`, entityType };
    if (first.subject) return { label: `${label}: ${first.subject}`, entityType };
    if (first.name) return { label: `${label}: ${first.name}`, entityType };

    return { label: label || entityType, entityType };
  } catch {
    return {};
  }
}

export async function offlineFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (typeof input !== "string" && "url" in input ? input.method : "GET")).toUpperCase();

  const isTrpcMutation =
    url.includes(TRPC_ENDPOINT) && method !== "GET" && method !== "HEAD";
  const isOtherMutation = !url.includes(TRPC_ENDPOINT) && method !== "GET" && method !== "HEAD";

  // Only handle mutation-style requests; GETs pass through (SW handles caching)
  if (!isTrpcMutation && !isOtherMutation) {
    return fetch(input, init);
  }

  // Quick offline check
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return enqueueAndReturn(input, init, url, isTrpcMutation);
  }

  // Online — try the request, catch OFFLINE responses
  try {
    const res = await fetch(input, init);

    // Check if SW returned OFFLINE stub
    if (await isOfflineResponse(res)) {
      return enqueueAndReturn(input, init, url, isTrpcMutation);
    }
    return res;
  } catch (err) {
    // Network error — likely offline. Enqueue and return synthetic response.
    if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
      return enqueueAndReturn(input, init, url, isTrpcMutation);
    }
    throw err;
  }
}

async function enqueueAndReturn(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  url: string,
  isTrpcMutation: boolean
): Promise<Response> {
  // Extract body
  let bodyStr: string | null = null;
  if (init?.body) {
    if (typeof init.body === "string") bodyStr = init.body;
    else if (init.body instanceof Blob) bodyStr = await init.body.text();
    else if (init.body instanceof ArrayBuffer) bodyStr = new TextDecoder().decode(init.body);
    else bodyStr = String(init.body);
  }

  // Build headers (exclude Authorization header so credentials are not persisted in IndexedDB)
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = new Headers(init.headers);
    h.forEach((v, k) => {
      if (k.toLowerCase() !== "authorization") {
        headers[k] = v;
      }
    });
  }
  if (!headers["Content-Type"] && isTrpcMutation) {
    headers["Content-Type"] = "application/json";
  }

  const { label, entityType } = extractLabel(url, bodyStr);
  const procNames = isTrpcMutation ? parseTrpcMutationUrl(url) : null;

  await enqueueMutation({
    url,
    method: (init?.method ?? "POST").toUpperCase(),
    headers,
    body: bodyStr,
    label,
    entityType,
  });

  // For tRPC mutations, return a synthetic success response so the
  // mutation hook resolves and the UI can show "queued" feedback.
  if (isTrpcMutation) {
    return makeQueuedResponse(procNames);
  }

  // For non-tRPC mutations, return a generic 202 Accepted
  return new Response(
    JSON.stringify({ queued: true, queuedAt: Date.now() }),
    { status: 202, headers: { "Content-Type": "application/json" } }
  );
}
