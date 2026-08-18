"use client";

// Client-side auth helpers. Stores the JWT token in localStorage and
// provides a fetch wrapper that adds the Authorization header.
// This is the reliable auth method through the TLS-terminating gateway
// (HttpOnly cookies may not be forwarded correctly by all gateways).

const TOKEN_KEY = "cf_token";
const USER_KEY = "cf_user";

export type ClientUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId?: string | null;
  orgRole?: string;
  isSuperAdmin?: boolean;
  organization?: { id: string; name: string; code: string } | null;
  // Session / impersonation metadata
  sessionKind?: "user" | "admin";
  impersonating?: boolean;
  impersonatedOrgId?: string | null;
  impersonatedOrg?: { id: string; name: string; code: string } | null;
  impersonatedReason?: string | null;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): ClientUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function notifyAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cf:auth-change"));
  }
}

export function setAuth(token: string, user: ClientUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notifyAuthChange();
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notifyAuthChange();
}

// fetch wrapper that adds the Authorization header if a token exists.
// NOTE: This is the plain fetch — for tRPC mutations, use the
// offline-aware fetch in `offline-fetch.ts` instead. This wrapper is
// used for non-tRPC requests (file uploads, /api/auth, /api/setup, etc.)
// and does NOT queue offline.
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
