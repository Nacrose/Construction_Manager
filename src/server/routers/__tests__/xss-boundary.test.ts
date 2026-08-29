/**
 * H-1 regression: stored-XSS payloads must be rejected at the ROUTER INPUT
 * boundary (safeUrlSchema) — before any handler code or db write runs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { vatRegisterRouter } from "../vat-register";
import { bankGuaranteeRouter } from "../bank-guarantee";

const anyDb = db as any;

beforeEach(() => {
  vi.clearAllMocks();
});

const XSS_PAYLOADS = [
  "javascript:alert(1)",
  "JAVASCRIPT:alert(1)",
  "java\tscript:alert(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "data:text/html,<script>alert(1)</script>",
  "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+",
  "vbscript:msgbox(1)",
];

/** A realistic attachScannedBill input with an injectable URL. */
function scanInput(url: string) {
  return {
    projectId: "p-1",
    targetType: "client_ipc" as const,
    targetId: "t-1",
    scannedBillUrl: url,
    scannedBillName: "scan.pdf",
  };
}

describe("vatRegister.attachScannedBill (H-1 input boundary)", () => {
  it.each(XSS_PAYLOADS)("rejects %s at the zod boundary", async (url) => {
    const caller = createCaller(vatRegisterRouter, buildUser());
    const res = await caller.attachScannedBill(scanInput(url)).catch((e: any) => e);
    expect(res).toBeInstanceOf(Error);
    expect([res.code, res.shape?.code]).toContain("BAD_REQUEST");
    // Crucially: no db writes may have happened with the poisoned URL
    expect(anyDb.payment.update).not.toHaveBeenCalled();
    expect(anyDb.ipc.update).not.toHaveBeenCalled();
  });

  it("accepts a legitimate inline PDF scan past validation (reaches the IDOR guard, not validation)", async () => {
    // Pin the auth + target-lookup path so this test is immune to mock
    // state leaked from other test files (vitest isolate:false shares the
    // module registry). Writable membership + missing IPC → NOT_FOUND,
    // which proves the URL passed the zod boundary.
    anyDb.projectMember.findUnique.mockReset().mockResolvedValue({ role: "engineer" });
    anyDb.ipc.findFirst.mockReset().mockResolvedValue(null);
    const caller = createCaller(vatRegisterRouter, buildUser());
    const res = await caller
      .attachScannedBill(
        scanInput("data:application/pdf;base64,JVBERi0xLjQK"),
      )
      .catch((e: any) => e);
    expect([res.code, res.shape?.code]).toContain("NOT_FOUND");
    expect(anyDb.ipc.update).not.toHaveBeenCalled();
  });

  it("accepts an authed storage route path (/api/files/<key>)", async () => {
    anyDb.projectMember.findUnique.mockReset().mockResolvedValue({ role: "engineer" });
    anyDb.ipc.findFirst.mockReset().mockResolvedValue(null);
    const caller = createCaller(vatRegisterRouter, buildUser());
    const res = await caller
      .attachScannedBill(
        scanInput("/api/files/1735432100123-1a2b3c4d5e6f7089.pdf"),
      )
      .catch((e: any) => e);
    expect([res.code, res.shape?.code]).toContain("NOT_FOUND"); // passed validation
  });
});

describe("bankGuarantee.create (H-1 documentUrl boundary)", () => {
  function bgInput(documentUrl: string) {
    return {
      type: "performance_bond" as const,
      guaranteeNumber: "BG/001",
      bankName: "Nabil",
      amount: 100000,
      issuedDate: "2026-01-01",
      expiryDate: "2026-12-31",
      documentUrl,
    };
  }

  it.each(["javascript:alert(1)", "data:text/html,<b>x</b>"])(
    "rejects %s at the zod boundary",
    async (url) => {
      const caller = createCaller(
        bankGuaranteeRouter,
        buildUser({ orgRole: "org_admin" }),
      );
      const res = await caller.create(bgInput(url)).catch((e: any) => e);
      expect(res).toBeInstanceOf(Error);
      expect([res.code, res.shape?.code]).toContain("BAD_REQUEST");
      expect(anyDb.bankGuarantee.create).not.toHaveBeenCalled();
    },
  );
});
