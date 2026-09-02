import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

// Deterministic secret for signing/verifying in tests (auth-config reads
// AUTH_SECRET lazily on first use, well after this assignment).
process.env.AUTH_SECRET = "test-only-auth-secret-0123456789abcdef0123456789";

// ── Mocks (auth.ts touches next/headers cookies + the Prisma client) ──────
const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock("@/lib/db", () => ({
  db: {
    session: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    $executeRawUnsafe: vi.fn(async () => 1),
  },
}));

import { db } from "@/lib/db";
import { getCurrentUser, clearSessionCookie, sanitizeAuthUser } from "./auth";

const anyDb = db as any;
const SECRET = new TextEncoder().encode(
  "test-only-auth-secret-0123456789abcdef0123456789",
);

async function signToken(
  over: { sub?: string; jti?: string; kind?: string; exp?: Date } = {},
): Promise<string> {
  const {
    sub = "user-1",
    jti = "jti-1",
    kind = "user",
    exp = new Date("2099-01-01T00:00:00Z"),
  } = over;
  return new SignJWT({ kind })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setJti(jti)
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(SECRET);
}

function sessionRow(over: Record<string, unknown> = {}) {
  return {
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    userId: "user-1",
    kind: "user",
    impersonatedOrgId: null,
    impersonatedAt: null,
    impersonatedReason: null,
    ...over,
  };
}

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "pm@example.com",
    name: "Project Manager",
    role: "engineer",
    avatarUrl: null,
    organizationId: "org-1",
    orgRole: "member",
    isSuperAdmin: false,
    organization: { id: "org-1", name: "Acme", code: "ACME" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  anyDb.$executeRawUnsafe.mockImplementation(async () => 1);
});

describe("getCurrentUser — cookie path (the v2.0 credential)", () => {
  it("resolves the user from the cf_session cookie alone", async () => {
    const token = await signToken();
    cookieStore.get.mockReturnValue({ value: token });
    anyDb.session.findUnique.mockResolvedValue(sessionRow());
    anyDb.user.findUnique.mockResolvedValue(userRow());

    const user = await getCurrentUser();

    expect(user).not.toBeNull();
    expect(user!.id).toBe("user-1");
    expect(user!.sessionKind).toBe("user");
    // sessionId (jti) is internal — present server-side for revocation
    expect(user!.sessionId).toBe("jti-1");
    expect(user!.isPlatformAdmin).toBe(false);
    // Cookie read, no Bearer header needed
    expect(cookieStore.get).toHaveBeenCalledWith("cf_session");
  });

  it("still honors an Authorization header when present (machine flows)", async () => {
    const tokenA = await signToken({ jti: "jti-A" });
    cookieStore.get.mockReturnValue({ value: "cookie-token" });
    anyDb.session.findUnique.mockImplementation(async ({ where }: any) =>
      where.token === "jti-A" ? sessionRow() : null,
    );
    anyDb.user.findUnique.mockResolvedValue(userRow());

    const user = await getCurrentUser(`Bearer ${tokenA}`);

    expect(user).not.toBeNull();
    expect(user!.sessionId).toBe("jti-A");
    // The cookie was never consulted — header takes precedence
    expect(cookieStore.get).not.toHaveBeenCalled();
  });

  it("returns null and prunes the DB session when it has expired", async () => {
    const token = await signToken();
    cookieStore.get.mockReturnValue({ value: token });
    anyDb.session.findUnique.mockResolvedValue(
      sessionRow({ expiresAt: new Date("2020-01-01T00:00:00Z") }),
    );

    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(anyDb.session.delete).toHaveBeenCalledWith({
      where: { token: "jti-1" },
    });
  });

  it("returns null when the session row is gone (revoked server-side)", async () => {
    const token = await signToken();
    cookieStore.get.mockReturnValue({ value: token });
    anyDb.session.findUnique.mockResolvedValue(null);

    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(anyDb.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns null without any credential", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await getCurrentUser()).toBeNull();
    expect(anyDb.session.findUnique).not.toHaveBeenCalled();
  });

  it("survives lastActiveAt write failures (presence is non-critical)", async () => {
    const token = await signToken();
    cookieStore.get.mockReturnValue({ value: token });
    anyDb.session.findUnique.mockResolvedValue(sessionRow());
    anyDb.user.findUnique.mockResolvedValue(userRow());
    anyDb.$executeRawUnsafe.mockRejectedValue(new Error("no such column"));

    const user = await getCurrentUser();
    expect(user).not.toBeNull();
    expect(user!.id).toBe("user-1");
  });
});

describe("getCurrentUser — impersonation downgrade", () => {
  it("downgrades an impersonating superadmin to a plain member of the target org", async () => {
    const token = await signToken();
    cookieStore.get.mockReturnValue({ value: token });
    anyDb.session.findUnique.mockResolvedValue(
      sessionRow({
        impersonatedOrgId: "org-2",
        impersonatedAt: new Date("2026-01-01T00:00:00Z"),
        impersonatedReason: "support ticket",
      }),
    );
    anyDb.user.findUnique.mockResolvedValue(
      userRow({
        isSuperAdmin: true,
        organizationId: null,
        orgRole: "org_admin",
      }),
    );
    anyDb.organization.findUnique.mockResolvedValue({
      id: "org-2",
      name: "Tenant Co",
      code: "TEN",
    });

    const user = await getCurrentUser();

    expect(user).not.toBeNull();
    // Effective identity is the tenant member — no god-view branch can trigger
    expect(user!.isSuperAdmin).toBe(false);
    expect(user!.orgRole).toBe("member");
    expect(user!.organizationId).toBe("org-2");
    // Real identity preserved for audit attribution
    expect(user!.isPlatformAdmin).toBe(true);
    expect(user!.impersonating).toBe(true);
    expect(user!.impersonatedOrg?.name).toBe("Tenant Co");
    expect(user!.impersonatedReason).toBe("support ticket");
  });

  it("surfaces admin-kind sessions unmodified (no impersonation)", async () => {
    const token = await signToken({ kind: "admin", jti: "jti-admin" });
    cookieStore.get.mockReturnValue({ value: token });
    anyDb.session.findUnique.mockResolvedValue(sessionRow({ kind: "admin" }));
    anyDb.user.findUnique.mockResolvedValue(
      userRow({ isSuperAdmin: true, orgRole: "org_admin" }),
    );

    const user = await getCurrentUser();

    expect(user!.sessionKind).toBe("admin");
    expect(user!.isSuperAdmin).toBe(true);
    expect(user!.impersonating).toBe(false);
  });
});

describe("sanitizeAuthUser", () => {
  it("strips the server-only sessionId before the user object reaches JS", () => {
    const sanitized = sanitizeAuthUser({
      ...userRow(),
      sessionKind: "user",
      sessionId: "jti-1",
    } as any);
    expect("sessionId" in sanitized).toBe(false);
    expect(sanitized.email).toBe("pm@example.com");
  });
});

describe("clearSessionCookie", () => {
  it("ALWAYS deletes the cookie and revokes the session it points at", async () => {
    const token = await signToken();
    cookieStore.get.mockReturnValue({ value: token });

    await clearSessionCookie();

    expect(cookieStore.delete).toHaveBeenCalledWith("cf_session");
    expect(anyDb.session.deleteMany).toHaveBeenCalledWith({
      where: { token: "jti-1" },
    });
  });

  it("deletes the cookie even when the token inside is garbage", async () => {
    cookieStore.get.mockReturnValue({ value: "not-a-jwt" });

    await clearSessionCookie();

    expect(cookieStore.delete).toHaveBeenCalledWith("cf_session");
    expect(anyDb.session.deleteMany).not.toHaveBeenCalled();
  });

  it("no-ops harmlessly when no cookie exists", async () => {
    cookieStore.get.mockReturnValue(undefined);

    await clearSessionCookie();

    expect(cookieStore.delete).toHaveBeenCalledWith("cf_session");
    expect(anyDb.session.deleteMany).not.toHaveBeenCalled();
  });
});
