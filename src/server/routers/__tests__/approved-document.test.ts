/**
 * Router-layer tests for approved-document.ts (signed-hardcopy archive).
 *
 * Pins:
 *   - list: composite where (projectId + entityType + entityId), member gate
 *   - get/update/delete: the child row is ALWAYS re-fetched with
 *     findFirst({ id, projectId }) — cross-project ids surface as NOT_FOUND
 *     (multi-tenant guard pin)
 *   - upload: documentType enum; fileSize positive + 10MB zod cap; the
 *     base64 payload re-checked at ~10MB decoded size (zod fileSize alone
 *     could be lied about); signedAt/receivedAt → Date; non-member gate
 *   - update: metadata-only (file content/size/name are immutable through
 *     this route); explicit null clears signedBy/signedAt/receivedAt
 *   - audit trail: upload + delete record approved_doc.* actions against
 *     the entity they belong to
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

// audit() defers its insert via next/server `after` — flush synchronously.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { db } from "@/lib/db";
import { approvedDocumentRouter } from "../approved-document";

const anyDb = db as any;
const USER = buildUser({ id: "user-1", name: "Sita Sharma" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

const uploadInput = {
  projectId: "p-1",
  entityType: "daily_report",
  entityId: "r-1",
  documentType: "signed_hardcopy",
  fileName: "signed-dr-001.pdf",
  fileType: "application/pdf",
  fileSize: 2048,
  data: "aGVsbG8=",
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── list ───────────────────────────────────────────────────────────────────
describe("approvedDocument.list", () => {
  it("queries by project + entity and FORBIDDENs non-members", async () => {
    member("engineer");
    anyDb.approvedDocument.findMany.mockResolvedValue([]);
    const caller = createCaller(approvedDocumentRouter, USER);

    await caller.list({ projectId: "p-1", entityType: "daily_report", entityId: "r-1" });
    expect(anyDb.approvedDocument.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      entityType: "daily_report",
      entityId: "r-1",
    });
    expect(anyDb.approvedDocument.findMany.mock.calls[0][0].orderBy).toEqual({
      uploadedAt: "desc",
    });

    member(null);
    await expectTRPCError(
      caller.list({ projectId: "p-1", entityType: "daily_report", entityId: "r-1" }),
      "FORBIDDEN",
    );
    expect(anyDb.approvedDocument.findMany).toHaveBeenCalledTimes(1);
  });
});

// ─── get ────────────────────────────────────────────────────────────────────
describe("approvedDocument.get", () => {
  it("NOT_FOUNDs an id that exists in ANOTHER project (IDOR pin)", async () => {
    member("engineer");
    anyDb.approvedDocument.findFirst.mockResolvedValue(null);
    const caller = createCaller(approvedDocumentRouter, USER);

    await expectTRPCError(
      caller.get({ id: "doc-1", projectId: "p-1" }),
      "NOT_FOUND",
    );
    // The lookup itself must be scoped to the caller's project.
    expect(anyDb.approvedDocument.findFirst).toHaveBeenCalledWith({
      where: { id: "doc-1", projectId: "p-1" },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  });

  it("returns the document (with base64 data) for members", async () => {
    member("engineer"); // any member may view the archive
    const row = { id: "doc-1", data: "abc", fileName: "f.pdf" };
    anyDb.approvedDocument.findFirst.mockResolvedValue(row);
    const caller = createCaller(approvedDocumentRouter, USER);

    const res = await caller.get({ id: "doc-1", projectId: "p-1" });
    expect(res.document).toBe(row);
  });
});

// ─── upload ─────────────────────────────────────────────────────────────────
describe("approvedDocument.upload", () => {
  it("persists the full metadata set and converts timestamps", async () => {
    member("engineer");
    const caller = createCaller(approvedDocumentRouter, USER);

    await caller.upload({
      ...uploadInput,
      signedBy: "Client Director",
      signedAt: "2026-02-01T00:00:00.000Z",
      receivedAt: "2026-02-02T00:00:00.000Z",
      notes: "Received by courier",
      pdfConfig: JSON.stringify({ template: "site-diary" }),
    });
    expect(anyDb.approvedDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p-1",
        entityType: "daily_report",
        entityId: "r-1",
        documentType: "signed_hardcopy",
        fileName: "signed-dr-001.pdf",
        fileType: "application/pdf",
        fileSize: 2048,
        data: "aGVsbG8=",
        uploadedById: "user-1",
        signedBy: "Client Director",
        signedAt: new Date("2026-02-01T00:00:00.000Z"),
        receivedAt: new Date("2026-02-02T00:00:00.000Z"),
        notes: "Received by courier",
        pdfConfig: JSON.stringify({ template: "site-diary" }),
      }),
    });
  });

  it("rejects documentTypes outside the enum (zod)", async () => {
    member("engineer");
    const caller = createCaller(approvedDocumentRouter, USER);
    await expectTRPCError(
      caller.upload({ ...uploadInput, documentType: "unknown" } as any),
      "BAD_REQUEST",
    );
    expect(anyDb.approvedDocument.create).not.toHaveBeenCalled();
  });

  it("rejects non-positive file sizes (zod positive)", async () => {
    member("engineer");
    const caller = createCaller(approvedDocumentRouter, USER);

    await expectTRPCError(
      caller.upload({ ...uploadInput, fileSize: 0 }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.upload({ ...uploadInput, fileSize: -100 }),
      "BAD_REQUEST",
    );
    expect(anyDb.approvedDocument.create).not.toHaveBeenCalled();
  });

  it("rejects declared sizes above the 10MB cap (zod max)", async () => {
    member("engineer");
    const caller = createCaller(approvedDocumentRouter, USER);
    await expectTRPCError(
      caller.upload({ ...uploadInput, fileSize: 10 * 1024 * 1024 + 1 }),
      "BAD_REQUEST",
    );
    expect(anyDb.approvedDocument.create).not.toHaveBeenCalled();
  });

  it("re-checks the DECODED base64 payload size — a small declared fileSize cannot smuggle a huge file", async () => {
    member("engineer");
    const caller = createCaller(approvedDocumentRouter, USER);

    // fileSize=1KB passes zod, but the payload decodes to ~10.5MB.
    await expectTRPCError(
      caller.upload({ ...uploadInput, data: "x".repeat(14_000_000) }),
      "BAD_REQUEST",
    );
    expect(anyDb.approvedDocument.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(approvedDocumentRouter, USER);
    await expectTRPCError(caller.upload(uploadInput), "FORBIDDEN");
    expect(anyDb.approvedDocument.create).not.toHaveBeenCalled();
  });

  it("records an audit entry naming the document type and entity", async () => {
    member("engineer");
    anyDb.approvedDocument.create.mockResolvedValue({
      id: "doc-9",
      fileName: "signed-dr-001.pdf",
      documentType: "signed_hardcopy",
      signedBy: "Client Director",
    });
    const caller = createCaller(approvedDocumentRouter, USER);

    await caller.upload({ ...uploadInput, signedBy: "Client Director" });
    expect(anyDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          projectId: "p-1",
          action: "approved_doc.upload.signed_hardcopy",
          entityType: "daily_report",
          entityId: "r-1",
        }),
      }),
    );
  });
});

// ─── update ─────────────────────────────────────────────────────────────────
describe("approvedDocument.update", () => {
  it("updates ONLY metadata — file content/size/name are immutable here", async () => {
    member("engineer");
    anyDb.approvedDocument.findFirst.mockResolvedValue({
      id: "doc-1",
      entityType: "rfi",
      entityId: "rfi-1",
      fileName: "f.pdf",
    });
    const caller = createCaller(approvedDocumentRouter, USER);

    await caller.update({
      id: "doc-1",
      projectId: "p-1",
      signedBy: "Client Director",
      signedAt: "2026-02-01T00:00:00.000Z",
      notes: "Signed in site office",
    });
    const data = anyDb.approvedDocument.update.mock.calls[0][0].data;
    expect(data).toEqual({
      signedBy: "Client Director",
      signedAt: new Date("2026-02-01T00:00:00.000Z"),
      notes: "Signed in site office",
    });
    expect("data" in data).toBe(false);
    expect("fileSize" in data).toBe(false);
    expect("fileName" in data).toBe(false);
  });

  it("explicit null clears signedBy/signedAt/receivedAt", async () => {
    member("engineer");
    anyDb.approvedDocument.findFirst.mockResolvedValue({ id: "doc-1" });
    const caller = createCaller(approvedDocumentRouter, USER);

    await caller.update({
      id: "doc-1",
      projectId: "p-1",
      signedBy: null,
      signedAt: null,
      receivedAt: null,
    });
    expect(anyDb.approvedDocument.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { signedBy: null, signedAt: null, receivedAt: null },
    });
  });

  it("NOT_FOUNDs a document id from another project (IDOR pin)", async () => {
    member("engineer");
    anyDb.approvedDocument.findFirst.mockResolvedValue(null);
    const caller = createCaller(approvedDocumentRouter, USER);

    await expectTRPCError(
      caller.update({ id: "doc-1", projectId: "p-1", notes: "x" }),
      "NOT_FOUND",
    );
    expect(anyDb.approvedDocument.update).not.toHaveBeenCalled();
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(approvedDocumentRouter, USER);
    await expectTRPCError(
      caller.update({ id: "doc-1", projectId: "p-1", notes: "x" }),
      "FORBIDDEN",
    );
    expect(anyDb.approvedDocument.findFirst).not.toHaveBeenCalled();
  });
});

// ─── delete ─────────────────────────────────────────────────────────────────
describe("approvedDocument.delete", () => {
  it("NOT_FOUNDs a document id from another project and deletes nothing", async () => {
    member("engineer");
    anyDb.approvedDocument.findFirst.mockResolvedValue(null);
    const caller = createCaller(approvedDocumentRouter, USER);

    await expectTRPCError(caller.delete({ id: "doc-1", projectId: "p-1" }), "NOT_FOUND");
    expect(anyDb.approvedDocument.delete).not.toHaveBeenCalled();
  });

  it("deletes a same-project document and audits against its entity", async () => {
    member("project_manager");
    anyDb.approvedDocument.findFirst.mockResolvedValue({
      id: "doc-1",
      entityType: "ipc",
      entityId: "ipc-7",
      fileName: "signed-ipc-7.pdf",
    });
    const caller = createCaller(approvedDocumentRouter, USER);

    await caller.delete({ id: "doc-1", projectId: "p-1" });
    expect(anyDb.approvedDocument.delete).toHaveBeenCalledWith({
      where: { id: "doc-1" },
    });
    expect(anyDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "approved_doc.delete",
          entityType: "ipc",
          entityId: "ipc-7",
          metadata: expect.stringContaining("signed-ipc-7.pdf"),
        }),
      }),
    );
  });
});
