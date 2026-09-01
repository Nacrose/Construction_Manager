/**
 * Router-layer tests for submittal.ts.
 *
 * Pins:
 *   - list: project scoping + status/type/q filters (insensitive OR)
 *   - get: NOT_FOUND, cross-project FORBIDDEN via the submittal's OWN
 *     project (assertProjectMember on s.projectId)
 *   - create: happy path (type default, YYYY-MM-DD → UTC Date transforms,
 *     createdById), zod enum/size validation, read-only FORBIDDEN
 *   - submit: state machine — only draft or revise_resubmit submittals can
 *     be submitted (regression: an APPROVED submittal could be flipped back
 *     to "submitted", silently destroying the review decision while
 *     leaving stale reviewedBy/reviewedDate behind); stamps submittedDate;
 *     NOT_FOUND + cross-project FORBIDDEN
 *   - review: only on SUBMITTED submittals (regression: a draft could be
 *     reviewed/approved without ever being submitted — bypassing the whole
 *     consultant workflow); approved/rejected/revise_resubmit persist
 *     reviewedDate/reviewedBy (default the caller's name)/comments/returned
 *     file; NOT_FOUND + cross-project FORBIDDEN + read-only FORBIDDEN
 *   - delete: cross-project IDOR guard (findFirst id+projectId — the
 *     pre-existing "IDOR FIX" pattern), happy path, read-only FORBIDDEN
 *   - stats: status counts, project-scoped, member-only
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { submittalRouter } from "../submittal";

const anyDb = db as any;
const USER = buildUser();

// Membership is project-scoped: the caller is a `role` on "p-1" only —
// lookups for any other project (IDOR probes) return null.
function member(role: string | null) {
  anyDb.projectMember.findUnique.mockImplementation(async ({ where }: any) =>
    where.projectId_userId?.projectId === "p-1" && role ? { role } : null,
  );
}

function submittal(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    projectId: "p-1",
    number: "SUB-001",
    title: "Footing rebar shop drawing",
    description: null,
    type: "shop_drawing",
    category: null,
    status: "draft",
    submittedDate: null,
    reviewedDate: null,
    reviewedBy: null,
    reviewComments: null,
    scheduledDate: null,
    dueDate: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── list ──────────────────────────────────────────────────────────────────
describe("submittal.list", () => {
  it("scopes to the project and applies status/type/search filters", async () => {
    member("engineer");
    anyDb.submittal.findMany.mockResolvedValue([submittal()]);
    const caller = createCaller(submittalRouter, USER);
    await caller.list({ projectId: "p-1", status: "draft", type: "shop_drawing", q: "footing" });

    const where = anyDb.submittal.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe("p-1");
    expect(where.status).toBe("draft");
    expect(where.type).toBe("shop_drawing");
    expect(where.OR).toEqual([
      { number: { contains: "footing", mode: "insensitive" } },
      { title: { contains: "footing", mode: "insensitive" } },
    ]);
    expect(anyDb.submittal.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.list({ projectId: "p-1" }), "FORBIDDEN");
    expect(anyDb.submittal.findMany).not.toHaveBeenCalled();
  });
});

// ─── get ───────────────────────────────────────────────────────────────────
describe("submittal.get", () => {
  it("returns the submittal to a project member", async () => {
    member("client"); // even read-only members may read
    anyDb.submittal.findUnique.mockResolvedValue(submittal());
    const caller = createCaller(submittalRouter, USER);
    const res = await caller.get({ id: "sub-1" });
    expect(res.submittal.id).toBe("sub-1");
  });

  it("NOT_FOUNDs a missing submittal", async () => {
    member("engineer");
    anyDb.submittal.findUnique.mockResolvedValue(null);
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.get({ id: "missing" }), "NOT_FOUND");
  });

  it("FORBIDDENs a submittal from another project", async () => {
    member("engineer"); // member of p-1 only
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ projectId: "p-other" }));
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.get({ id: "sub-1" }), "FORBIDDEN");
  });
});

// ─── create ────────────────────────────────────────────────────────────────
describe("submittal.create", () => {
  const baseInput = {
    projectId: "p-1",
    number: "SUB-001",
    title: "Footing rebar shop drawing",
  };

  it("creates the submittal with defaults, UTC-normalized dates, and the creator stamped", async () => {
    member("engineer");
    anyDb.submittal.create.mockResolvedValue(submittal());
    const caller = createCaller(submittalRouter, USER);
    await caller.create({
      ...baseInput,
      scheduledDate: "2026-09-01",
      dueDate: "2026-09-15",
      fileData: "b64",
      fileName: "dwg.pdf",
      fileType: "application/pdf",
    });

    expect(anyDb.submittal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p-1",
        number: "SUB-001",
        type: "shop_drawing", // zod default
        scheduledDate: new Date("2026-09-01T00:00:00.000Z"),
        dueDate: new Date("2026-09-15T00:00:00.000Z"),
        createdById: "user-1",
        fileData: "b64",
        fileType: "application/pdf",
      }),
    });
  });

  it("rejects an invalid type enum (zod)", async () => {
    member("engineer");
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(
      caller.create({ ...baseInput, type: "napkin_sketch" as any }),
      "BAD_REQUEST",
    );
    expect(anyDb.submittal.create).not.toHaveBeenCalled();
  });

  it("rejects file payloads over the 20 MB cap (zod)", async () => {
    member("engineer");
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(
      caller.create({ ...baseInput, fileData: "x".repeat(20_000_001) }),
      "BAD_REQUEST",
    );
    expect(anyDb.submittal.create).not.toHaveBeenCalled();
  });

  it("rejects a missing title (zod min(1))", async () => {
    member("engineer");
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(
      caller.create({ ...baseInput, title: "" }),
      "BAD_REQUEST",
    );
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.create(baseInput), "FORBIDDEN");
    expect(anyDb.submittal.create).not.toHaveBeenCalled();
  });
});

// ─── submit ────────────────────────────────────────────────────────────────
describe("submittal.submit", () => {
  it("submits a draft and stamps submittedDate", async () => {
    member("engineer");
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ status: "draft" }));
    const caller = createCaller(submittalRouter, USER);
    await caller.submit({ id: "sub-1" });
    const data = anyDb.submittal.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe("submitted");
    expect(data.submittedDate).toBeInstanceOf(Date);
  });

  it("allows resubmitting a revise_resubmit submittal", async () => {
    member("engineer");
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ status: "revise_resubmit" }));
    const caller = createCaller(submittalRouter, USER);
    await caller.submit({ id: "sub-1" });
    expect(anyDb.submittal.updateMany.mock.calls[0][0].data.status).toBe("submitted");
  });

  /**
   * REGRESSION (missing state guard): submit had no status check — an
   * APPROVED submittal could be flipped back to "submitted", silently
   * destroying the review decision (stale reviewedBy/reviewedDate left
   * behind) and re-opening a closed loop.
   */
  it("rejects re-submitting an already approved submittal", async () => {
    member("engineer");
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ status: "approved" }));
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.submit({ id: "sub-1" }), "BAD_REQUEST");
    expect(anyDb.submittal.updateMany).not.toHaveBeenCalled();
  });

  it("rejects re-submitting an already submitted submittal", async () => {
    member("engineer");
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ status: "submitted" }));
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.submit({ id: "sub-1" }), "BAD_REQUEST");
    expect(anyDb.submittal.updateMany).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a missing submittal", async () => {
    member("engineer");
    anyDb.submittal.findUnique.mockResolvedValue(null);
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.submit({ id: "missing" }), "NOT_FOUND");
  });

  it("FORBIDDENs a submittal from another project", async () => {
    member("engineer"); // member of p-1 only
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ projectId: "p-other" }));
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.submit({ id: "sub-1" }), "FORBIDDEN");
    expect(anyDb.submittal.updateMany).not.toHaveBeenCalled();
  });
});

// ─── review ────────────────────────────────────────────────────────────────
describe("submittal.review", () => {
  const reviewInput = {
    id: "sub-1",
    status: "approved" as const,
  };

  it("approves a submitted submittal, stamping reviewer (default caller name), date, and comments", async () => {
    member("project_manager");
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ status: "submitted" }));
    const caller = createCaller(submittalRouter, buildUser({ id: "user-1", name: "Eng Name" }));
    await caller.review({
      ...reviewInput,
      reviewComments: "As per spec",
      returnedFileData: "b64",
      returnedFileName: "marked.pdf",
      returnedFileType: "application/pdf",
    });

    expect(anyDb.submittal.updateMany).toHaveBeenCalledWith({
      where: { id: "sub-1", status: "submitted" },
      data: expect.objectContaining({
        status: "approved",
        reviewedDate: expect.any(Date),
        reviewedBy: "Eng Name",
        reviewComments: "As per spec",
        returnedFileData: "b64",
        returnedFileName: "marked.pdf",
        returnedFileType: "application/pdf",
      }),
    });
  });

  it("rejects and revise_resubmit decisions persist on submitted submittals", async () => {
    member("project_manager");
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ status: "submitted" }));
    const caller = createCaller(submittalRouter, USER);
    await caller.review({ ...reviewInput, status: "revise_resubmit" });
    expect(anyDb.submittal.updateMany.mock.calls[0][0].data.status).toBe("revise_resubmit");
  });

  /**
   * REGRESSION (missing state guard): review had no status check — a DRAFT
   * submittal could be reviewed/approved without ever being submitted to
   * the consultant, bypassing the submission workflow entirely.
   */
  it("rejects reviewing a draft (never submitted) submittal", async () => {
    member("project_manager");
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ status: "draft" }));
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.review(reviewInput), "BAD_REQUEST");
    expect(anyDb.submittal.updateMany).not.toHaveBeenCalled();
  });

  it("rejects re-reviewing an already decided (approved) submittal", async () => {
    member("project_manager");
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ status: "approved" }));
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(
      caller.review({ ...reviewInput, status: "rejected" }),
      "BAD_REQUEST",
    );
    expect(anyDb.submittal.updateMany).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a missing submittal", async () => {
    member("project_manager");
    anyDb.submittal.findUnique.mockResolvedValue(null);
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.review(reviewInput), "NOT_FOUND");
  });

  it("FORBIDDENs a submittal from another project", async () => {
    member("project_manager"); // member of p-1 only
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ projectId: "p-other", status: "submitted" }));
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.review(reviewInput), "FORBIDDEN");
    expect(anyDb.submittal.updateMany).not.toHaveBeenCalled();
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    anyDb.submittal.findUnique.mockResolvedValue(submittal({ status: "submitted" }));
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.review(reviewInput), "FORBIDDEN");
    expect(anyDb.submittal.updateMany).not.toHaveBeenCalled();
  });
});

// ─── delete ────────────────────────────────────────────────────────────────
describe("submittal.delete", () => {
  it("NOT_FOUNDs a submittal outside the caller's project (IDOR guard)", async () => {
    member("engineer"); // writer on p-1
    anyDb.submittal.findFirst.mockResolvedValue(null); // the id lives in another project
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.delete({ id: "sub-x", projectId: "p-1" }), "NOT_FOUND");
    expect(anyDb.submittal.delete).not.toHaveBeenCalled();
  });

  it("deletes a submittal of the caller's project", async () => {
    member("engineer");
    anyDb.submittal.findFirst.mockResolvedValue({ id: "sub-1" });
    anyDb.submittal.delete.mockResolvedValue(submittal());
    const caller = createCaller(submittalRouter, USER);
    const res = await caller.delete({ id: "sub-1", projectId: "p-1" });
    expect(res.ok).toBe(true);
    expect(anyDb.submittal.findFirst).toHaveBeenCalledWith({
      where: { id: "sub-1", projectId: "p-1" },
      select: { id: true },
    });
    expect(anyDb.submittal.delete).toHaveBeenCalledWith({ where: { id: "sub-1" } });
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.delete({ id: "sub-1", projectId: "p-1" }), "FORBIDDEN");
    expect(anyDb.submittal.delete).not.toHaveBeenCalled();
  });
});

// ─── stats ─────────────────────────────────────────────────────────────────
describe("submittal.stats", () => {
  it("counts submittals by status, scoped to the project", async () => {
    member("engineer");
    anyDb.submittal.findMany.mockResolvedValue([
      { status: "draft", type: "shop_drawing" },
      { status: "draft", type: "product_data" },
      { status: "submitted", type: "shop_drawing" },
      { status: "approved", type: "shop_drawing" },
      { status: "rejected", type: "material_sample" },
      { status: "revise_resubmit", type: "other" },
    ]);
    const caller = createCaller(submittalRouter, USER);
    const res = await caller.stats({ projectId: "p-1" });

    expect(anyDb.submittal.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
    expect(res).toEqual({
      total: 6,
      draft: 2,
      submitted: 1,
      approved: 1,
      rejected: 1,
      revise: 1,
    });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(submittalRouter, USER);
    await expectTRPCError(caller.stats({ projectId: "p-1" }), "FORBIDDEN");
  });
});
