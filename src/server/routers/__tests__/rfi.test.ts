/**
 * Router-layer tests for rfi.ts.
 *
 * Pins:
 *   - Duplicate RFI number per project → CONFLICT (unique scope)
 *   - Discipline auto-routing picks the first eligible PM/coordinator member
 *   - Status transition whitelist + role gates (writer submits, admin decides)
 *   - respond() is admin-only, only on submitted RFIs; "info" keeps status
 *     submitted (documented design — separate audited path)
 *   - delete: author-or-PM only; non-PM authors can only delete drafts
 *   - Comments: any member can post; only the author can delete
 *   - uploadAttachment: MIME whitelist; fail-loud when the owning project
 *     has no organization (C-4 storage registration regression)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(async () => ({ url: "/api/files/stored-1", key: "stored-1" })),
  deleteFile: vi.fn(async () => undefined),
}));

import { db } from "@/lib/db";
import { rfiRouter } from "../rfi";

const anyDb = db as any;
const ENGINEER = buildUser({ id: "eng-1" });
const PM = buildUser({ id: "pm-user-1" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function rfi(overrides: Record<string, unknown> = {}) {
  return {
    id: "rfi-1",
    projectId: "p-1",
    number: "RFI-001",
    subject: "Clarify footing depth",
    status: "draft",
    createdById: "eng-1",
    workDate: null,
    submittedAt: null,
    respondedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── create ─────────────────────────────────────────────────────────────────
describe("rfi.create", () => {
  const baseInput = {
    projectId: "p-1",
    number: "RFI-001",
    subject: "Clarify footing depth",
  };

  it("CONFLICTs on a duplicate number within the same project", async () => {
    member("engineer");
    anyDb.rfi.findUnique.mockResolvedValue({ id: "existing" });
    const caller = createCaller(rfiRouter, ENGINEER);
    await expectTRPCError(caller.create(baseInput), "CONFLICT");
    expect(anyDb.rfi.create).not.toHaveBeenCalled();
  });

  it("auto-routes by discipline to the first eligible member when no assignee is given", async () => {
    member("engineer");
    anyDb.rfi.findUnique.mockResolvedValue(null);
    anyDb.projectMember.findFirst.mockResolvedValue({ id: "mem-9" });
    const caller = createCaller(rfiRouter, ENGINEER);
    await caller.create({ ...baseInput, discipline: "civil" });
    expect(anyDb.projectMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "p-1", role: { in: ["project_manager", "coordinator"] } },
      }),
    );
    expect(anyDb.rfi.create.mock.calls[0][0].data.assignedToId).toBe("mem-9");
  });

  it("keeps an explicit assignee and does not auto-route", async () => {
    member("engineer");
    anyDb.rfi.findUnique.mockResolvedValue(null);
    const caller = createCaller(rfiRouter, ENGINEER);
    await caller.create({ ...baseInput, assignedToId: "mem-1" });
    expect(anyDb.projectMember.findFirst).not.toHaveBeenCalled();
    expect(anyDb.rfi.create.mock.calls[0][0].data.assignedToId).toBe("mem-1");
  });

  it("notifies the assignee (not the actor) when an RFI is assigned", async () => {
    member("engineer");
    anyDb.rfi.findUnique.mockResolvedValue(null);
    // projectMember.findUnique serves two lookups in this flow:
    // the role check (projectId_userId) and the assignee lookup (by id).
    anyDb.projectMember.findUnique.mockImplementation(async ({ where }: any) =>
      where.projectId_userId
        ? { role: "engineer" }
        : { userId: "someone-else" },
    );
    const caller = createCaller(rfiRouter, ENGINEER);
    await caller.create({ ...baseInput, assignedToId: "mem-1" });
    expect(anyDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "someone-else", type: "rfi_created" }),
      }),
    );
  });
});

// ─── update: field edits + status machine ──────────────────────────────────
describe("rfi.update", () => {
  it("lets a writer edit draft fields", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi());
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await caller.update({ id: "rfi-1", subject: "Updated subject" });
    expect(anyDb.rfi.update.mock.calls[0][0].data.subject).toBe("Updated subject");
  });

  it("ignores field edits for non-draft RFIs (status-only updates)", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "submitted" }));
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await caller.update({ id: "rfi-1", subject: "Sneaky edit" });
    expect(anyDb.rfi.update.mock.calls[0][0].data.subject).toBeUndefined();
  });

  it("rejects submitted→approved by a plain writer (admin decision required)", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "submitted" }));
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ id: "rfi-1", status: "approved" }),
      "BAD_REQUEST",
    );
    expect(anyDb.rfi.update).not.toHaveBeenCalled();
  });

  it("allows submitted→approved for a PM and stamps respondedAt", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "submitted" }));
    member("project_manager");
    const caller = createCaller(rfiRouter, PM);
    await caller.update({ id: "rfi-1", status: "approved" });
    // Engine CAS contract: updateMany claims the submitted status
    const call = anyDb.rfi.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "rfi-1", status: "submitted" });
    expect(call.data.status).toBe("approved");
    expect(call.data.respondedAt).toBeInstanceOf(Date);
  });

  it("allows draft→submitted for a writer and stamps submittedAt", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi());
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await caller.update({ id: "rfi-1", status: "submitted" });
    const call = anyDb.rfi.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "rfi-1", status: "draft" });
    expect(call.data.status).toBe("submitted");
    expect(call.data.submittedAt).toBeInstanceOf(Date);
  });

  it("rejects transitions outside the whitelist (approved→submitted)", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "approved" }));
    member("project_manager");
    const caller = createCaller(rfiRouter, PM);
    await expectTRPCError(
      caller.update({ id: "rfi-1", status: "submitted" }),
      "BAD_REQUEST",
    );
  });

  it("non-members cannot update at all", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi());
    member(null);
    const caller = createCaller(rfiRouter, ENGINEER);
    await expectTRPCError(
      caller.update({ id: "rfi-1", subject: "Nope" }),
      "FORBIDDEN",
    );
  });
});

// ─── respond ────────────────────────────────────────────────────────────────
describe("rfi.respond", () => {
  const respondInput = { id: "rfi-1", response: "Approved as per drawing", decision: "info" };

  it("is admin-only (engineer FORBIDDEN)", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "submitted" }));
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await expectTRPCError(caller.respond(respondInput), "FORBIDDEN");
    expect(anyDb.rfiResponse.create).not.toHaveBeenCalled();
  });

  it("rejects responding to a non-submitted RFI", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "approved" }));
    member("project_manager");
    const caller = createCaller(rfiRouter, PM);
    await expectTRPCError(caller.respond(respondInput), "BAD_REQUEST");
  });

  it("maps decision=approved to status approved", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "submitted" }));
    member("project_manager");
    const caller = createCaller(rfiRouter, PM);
    await caller.respond({ ...respondInput, decision: "approved" });
    // Engine CAS contract: updateMany claims the submitted status
    const call = anyDb.rfi.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "rfi-1", status: "submitted" });
    expect(call.data.status).toBe("approved");
  });

  it("CONFLICTs when a concurrent decision wins the race (CAS regression)", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "submitted" }));
    member("project_manager");
    // engine CAS matches 0 rows → another admin already decided this RFI
    anyDb.rfi.updateMany.mockResolvedValue({ count: 0 });
    const caller = createCaller(rfiRouter, PM);

    await expectTRPCError(
      caller.respond({ ...respondInput, decision: "approved" }),
      "CONFLICT",
    );
  });

  it("update: CONFLICTs when a concurrent decision wins the race (CAS regression)", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "submitted" }));
    member("project_manager");
    anyDb.rfi.updateMany.mockResolvedValue({ count: 0 });
    const caller = createCaller(rfiRouter, PM);

    await expectTRPCError(
      caller.update({ id: "rfi-1", status: "approved" }),
      "CONFLICT",
    );
  });

  it("keeps status submitted for decision=info (documented design)", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "submitted" }));
    member("coordinator");
    const caller = createCaller(rfiRouter, PM);
    await caller.respond(respondInput);
    // Info decisions are NOT a graph transition — CAS-guarded respondAt write
    const call = anyDb.rfi.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "rfi-1", status: "submitted" });
    expect(call.data.status).toBeUndefined();
    expect(call.data.respondedAt).toBeInstanceOf(Date);
    expect(anyDb.rfiResponse.create.mock.calls[0][0].data.decision).toBe("info");
  });
});

// ─── delete ─────────────────────────────────────────────────────────────────
describe("rfi.delete", () => {
  it("FORBIDDENs users who are neither the author nor a PM", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ createdById: "someone-else" }));
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await expectTRPCError(caller.delete({ id: "rfi-1" }), "FORBIDDEN");
    expect(anyDb.rfi.delete).not.toHaveBeenCalled();
  });

  it("non-PM authors can only delete their own DRAFTS", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(
      rfi({ createdById: "eng-1", status: "submitted" }),
    );
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await expectTRPCError(caller.delete({ id: "rfi-1" }), "BAD_REQUEST");
    expect(anyDb.rfi.delete).not.toHaveBeenCalled();
  });

  it("deletes the author's own draft and cleans up program tasks", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ createdById: "eng-1" }));
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await caller.delete({ id: "rfi-1" });
    expect(anyDb.dailyProgramTask.deleteMany).toHaveBeenCalledWith({
      where: { rfiId: "rfi-1" },
    });
    expect(anyDb.rfi.delete).toHaveBeenCalledWith({ where: { id: "rfi-1" } });
  });
});

// ─── comments & attachments ─────────────────────────────────────────────────
describe("rfi comments", () => {
  it("any project member can comment", async () => {
    anyDb.rfi.findUnique.mockResolvedValue(rfi({ status: "submitted" }));
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await caller.addComment({ rfiId: "rfi-1", content: "Client note" });
    expect(anyDb.rfiComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authorId: "eng-1", content: "Client note" }),
      }),
    );
  });

  it("only the author can delete a comment", async () => {
    anyDb.rfiComment.findUnique.mockResolvedValue({
      id: "c-1",
      authorId: "someone-else",
      rfiId: "rfi-1",
      rfi: { projectId: "p-1" },
    });
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await expectTRPCError(caller.deleteComment({ id: "c-1" }), "FORBIDDEN");
    expect(anyDb.rfiComment.delete).not.toHaveBeenCalled();
  });
});

describe("rfi.uploadAttachment", () => {
  const uploadInput = {
    rfiId: "rfi-1",
    fileName: "site-photo.jpg",
    fileType: "image/jpeg",
    fileSize: 1024,
    data: "base64data",
  };

  it("rejects file types outside the MIME whitelist", async () => {
    anyDb.rfi.findUnique.mockResolvedValue({
      projectId: "p-1",
      project: { organizationId: "org-1" },
    });
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await expectTRPCError(
      caller.uploadAttachment({ ...uploadInput, fileType: "application/x-msdownload" }),
      "BAD_REQUEST",
    );
    expect(anyDb.rfiAttachment.create).not.toHaveBeenCalled();
  });

  it("fails loud when the owning project has no organization (C-4)", async () => {
    anyDb.rfi.findUnique.mockResolvedValue({
      projectId: "p-1",
      project: { organizationId: null },
    });
    member("engineer");
    const caller = createCaller(
      rfiRouter,
      buildUser({ id: "eng-1", organizationId: null }),
    );
    await expectTRPCError(
      caller.uploadAttachment(uploadInput),
      "INTERNAL_SERVER_ERROR",
    );
    expect(anyDb.rfiAttachment.create).not.toHaveBeenCalled();
  });

  it("stores allowed types and links the registered storage URL", async () => {
    anyDb.rfi.findUnique.mockResolvedValue({
      projectId: "p-1",
      project: { organizationId: "org-1" },
    });
    member("engineer");
    const caller = createCaller(rfiRouter, ENGINEER);
    await caller.uploadAttachment({ ...uploadInput, fileType: "application/pdf" });
    expect(anyDb.rfiAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storageUrl: "/api/files/stored-1" }),
      }),
    );
  });
});
