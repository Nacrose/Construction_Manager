/**
 * Router-layer tests for daily-report-attachments.ts.
 *
 * Pins:
 *   - listAttachments: metadata-only select (the base64 `data` column must
 *     NOT be pulled by the listing — regression), reportId scoping,
 *     NOT_FOUND for missing reports, read-only roles FORBIDDEN (current
 *     documented behavior — see report for the suspected read-gate issue)
 *   - uploadAttachment: zod size caps (fileSize ≤ 10 MB, base64 data
 *     ≤ 14 MB), MIME whitelist (SVG/exe rejected), NOT_FOUND report,
 *     read-only FORBIDDEN, fail-loud when neither the project nor the
 *     caller has an organization (C-4 storage registration), and the
 *     happy path registering the file with the owning org + linking the
 *     storage URL + EXIF-lite metadata (lat/lon/takenAt)
 *   - getAttachmentData: single-attachment binary fetch, NOT_FOUND,
 *     cross-project FORBIDDEN via the owning report's project
 *   - deleteAttachment: NOT_FOUND, storage cleanup called with the
 *     storageUrl, best-effort cleanup (a storage failure must not block
 *     the row delete), row deleted by id
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

const uploadFileMock = vi.fn(async () => ({ url: "/api/files/stored-1", key: "stored-1" }));
const deleteFileMock = vi.fn(async () => undefined);

vi.mock("@/lib/storage", () => ({
  uploadFile: (...args: unknown[]) => uploadFileMock(...(args as [])),
  deleteFile: (...args: unknown[]) => deleteFileMock(...(args as [])),
}));

import { db } from "@/lib/db";
import { dailyReportAttachmentsRouter } from "../daily-report-attachments";

const anyDb = db as any;
const USER = buildUser();

// Membership is project-scoped: the caller is a `role` on "p-1" only —
// lookups for any other project (IDOR probes) return null.
function member(role: string | null) {
  anyDb.projectMember.findUnique.mockImplementation(async ({ where }: any) =>
    where.projectId_userId?.projectId === "p-1" && role ? { role } : null,
  );
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "p-1",
    project: { organizationId: "org-1" },
    ...overrides,
  };
}

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    reportId: "rep-1",
    fileName: "site-photo.jpg",
    fileType: "image/jpeg",
    fileSize: 1024,
    storageUrl: "/api/files/stored-1",
    data: "base64data",
    uploadedById: "user-1",
    latitude: null,
    longitude: null,
    takenAt: null,
    uploadedAt: new Date("2026-08-15T10:00:00.000Z"),
    report: { projectId: "p-1" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  uploadFileMock.mockClear();
  deleteFileMock.mockClear();
});

// ─── listAttachments ───────────────────────────────────────────────────────
describe("dailyReportAttachments.listAttachments", () => {
  it("lists metadata only — the base64 `data` column is never selected", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(report());
    anyDb.dailyReportAttachment.findMany.mockResolvedValue([attachment()]);
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    const res = await caller.listAttachments({ reportId: "rep-1" });

    const select = anyDb.dailyReportAttachment.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("data");
    expect(select).toEqual(
      expect.objectContaining({ id: true, fileName: true, fileType: true, fileSize: true, storageUrl: true }),
    );
    expect(anyDb.dailyReportAttachment.findMany.mock.calls[0][0].where).toEqual({ reportId: "rep-1" });
    expect(res.attachments[0].fileName).toBe("site-photo.jpg");
  });

  it("NOT_FOUNDs a missing report", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(null);
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(caller.listAttachments({ reportId: "missing" }), "NOT_FOUND");
    expect(anyDb.dailyReportAttachment.findMany).not.toHaveBeenCalled();
  });

  it("FORBIDDENs read-only roles (client) — current behavior", async () => {
    member("client");
    anyDb.dailyReport.findUnique.mockResolvedValue(report());
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(caller.listAttachments({ reportId: "rep-1" }), "FORBIDDEN");
    expect(anyDb.dailyReportAttachment.findMany).not.toHaveBeenCalled();
  });
});

// ─── uploadAttachment ──────────────────────────────────────────────────────
describe("dailyReportAttachments.uploadAttachment", () => {
  const uploadInput = {
    reportId: "rep-1",
    fileName: "site-photo.jpg",
    fileType: "image/jpeg",
    fileSize: 1024,
    data: "base64data",
    latitude: 27.7172,
    longitude: 85.324,
    takenAt: "2026-08-15T09:30:00.000Z",
  };

  it("stores the file with the owning org and links the registered storage URL", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(report());
    anyDb.dailyReportAttachment.create.mockResolvedValue(attachment());
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await caller.uploadAttachment(uploadInput);

    expect(uploadFileMock).toHaveBeenCalledWith("base64data", "site-photo.jpg", "image/jpeg", {
      organizationId: "org-1",
      projectId: "p-1",
    });
    expect(anyDb.dailyReportAttachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reportId: "rep-1",
        fileName: "site-photo.jpg",
        fileSize: 1024,
        storageUrl: "/api/files/stored-1",
        uploadedById: "user-1",
        latitude: 27.7172,
        longitude: 85.324,
        takenAt: new Date("2026-08-15T09:30:00.000Z"),
      }),
    });
  });

  it("rejects file types outside the MIME whitelist (SVG)", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(report());
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(
      caller.uploadAttachment({ ...uploadInput, fileType: "image/svg+xml" }),
      "BAD_REQUEST",
    );
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(anyDb.dailyReportAttachment.create).not.toHaveBeenCalled();
  });

  it("rejects files over the 10 MB cap (zod)", async () => {
    member("engineer");
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(
      caller.uploadAttachment({ ...uploadInput, fileSize: 10 * 1024 * 1024 + 1 }),
      "BAD_REQUEST",
    );
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it("rejects base64 payloads over the 14 MB cap (zod)", async () => {
    member("engineer");
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(
      caller.uploadAttachment({ ...uploadInput, fileSize: 1024, data: "x".repeat(14 * 1024 * 1024 + 1) }),
      "BAD_REQUEST",
    );
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a missing report", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(null);
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(caller.uploadAttachment(uploadInput), "NOT_FOUND");
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it("FORBIDDENs read-only roles (inspector)", async () => {
    member("inspector");
    anyDb.dailyReport.findUnique.mockResolvedValue(report());
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(caller.uploadAttachment(uploadInput), "FORBIDDEN");
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it("fails loud when neither the project nor the caller has an organization (C-4)", async () => {
    member("engineer");
    anyDb.dailyReport.findUnique.mockResolvedValue(report({ project: { organizationId: null } }));
    const caller = createCaller(
      dailyReportAttachmentsRouter,
      buildUser({ id: "user-1", organizationId: null }),
    );
    await expectTRPCError(caller.uploadAttachment(uploadInput), "INTERNAL_SERVER_ERROR");
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(anyDb.dailyReportAttachment.create).not.toHaveBeenCalled();
  });
});

// ─── getAttachmentData ─────────────────────────────────────────────────────
describe("dailyReportAttachments.getAttachmentData", () => {
  it("returns the binary payload for a project writer", async () => {
    member("engineer");
    anyDb.dailyReportAttachment.findUnique.mockResolvedValue(attachment());
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    const res = await caller.getAttachmentData({ id: "att-1" });
    expect(res).toEqual({ data: "base64data", fileType: "image/jpeg", fileName: "site-photo.jpg" });
  });

  it("NOT_FOUNDs a missing attachment", async () => {
    member("engineer");
    anyDb.dailyReportAttachment.findUnique.mockResolvedValue(null);
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(caller.getAttachmentData({ id: "missing" }), "NOT_FOUND");
  });

  it("FORBIDDENs an attachment whose report belongs to another project", async () => {
    member("engineer"); // caller IS a member of p-1…
    anyDb.dailyReportAttachment.findUnique.mockResolvedValue(
      attachment({ report: { projectId: "p-other" } }), // …but the attachment is foreign
    );
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(caller.getAttachmentData({ id: "att-1" }), "FORBIDDEN");
  });
});

// ─── deleteAttachment ──────────────────────────────────────────────────────
describe("dailyReportAttachments.deleteAttachment", () => {
  it("deletes the row and cleans up storage using the stored URL", async () => {
    member("engineer");
    anyDb.dailyReportAttachment.findUnique.mockResolvedValue(attachment());
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    const res = await caller.deleteAttachment({ id: "att-1" });
    expect(res.success).toBe(true);
    expect(deleteFileMock).toHaveBeenCalledWith("/api/files/stored-1");
    expect(anyDb.dailyReportAttachment.delete).toHaveBeenCalledWith({ where: { id: "att-1" } });
  });

  it("still deletes the row when storage cleanup fails (best-effort)", async () => {
    member("engineer");
    anyDb.dailyReportAttachment.findUnique.mockResolvedValue(attachment());
    deleteFileMock.mockRejectedValue(new Error("storage down"));
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    const res = await caller.deleteAttachment({ id: "att-1" });
    expect(res.success).toBe(true);
    expect(anyDb.dailyReportAttachment.delete).toHaveBeenCalledWith({ where: { id: "att-1" } });
  });

  it("NOT_FOUNDs a missing attachment", async () => {
    member("engineer");
    anyDb.dailyReportAttachment.findUnique.mockResolvedValue(null);
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(caller.deleteAttachment({ id: "missing" }), "NOT_FOUND");
    expect(anyDb.dailyReportAttachment.delete).not.toHaveBeenCalled();
  });

  it("FORBIDDENs an attachment whose report belongs to another project", async () => {
    member("engineer");
    anyDb.dailyReportAttachment.findUnique.mockResolvedValue(
      attachment({ report: { projectId: "p-other" } }),
    );
    const caller = createCaller(dailyReportAttachmentsRouter, USER);
    await expectTRPCError(caller.deleteAttachment({ id: "att-1" }), "FORBIDDEN");
    expect(anyDb.dailyReportAttachment.delete).not.toHaveBeenCalled();
  });
});
