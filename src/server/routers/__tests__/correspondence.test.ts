/**
 * Router-layer tests for correspondence.ts (letter register).
 *
 * Pins:
 *   - list: filter composition (direction/category/replyStatus/letterType,
 *     case-insensitive OR search) and the overdue filter (past due +
 *     not_started/in_progress + actionable only)
 *   - get/getThread: authorization through the letter's own project
 *   - create: ourRef sequence (COR-<year>-<pad 4>), EOT claims start in
 *     "submitted", 10MB base64 file cap, statusHistory seed, read-only gate;
 *     repliesToId must belong to the SAME project (regression: a foreign
 *     parent id was accepted, which leaks the reply into the other
 *     project's thread via the LetterThread relation)
 *   - create/updateEot: negative day counts rejected (regression: a
 *     negative eotDaysClaimed/eotDaysGranted was silently accepted)
 *   - updateReply: status-history append with actor identity; "sent"
 *     auto-stamps replySentDate; reply files respect the same 10MB cap
 *     (regression: create capped fileData but updateReply accepted
 *     arbitrarily large replyFileData)
 *   - stats: overdue/pending/drafted/sent/closed classification and
 *     byCategory counting over ALL letters
 *   - delete: cross-project guard (existing IDOR fix — regression pin)
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
import { correspondenceRouter } from "../correspondence";

const anyDb = db as any;
const USER = buildUser({ id: "user-1", name: "Sita Sharma" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

const DAY = 86400000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const inDays = (n: number) => new Date(Date.now() + n * DAY);

function letter(overrides: Record<string, unknown> = {}) {
  return {
    id: "L-1",
    projectId: "p-1",
    direction: "incoming",
    ourRef: "COR-2026-0001",
    theirRef: "CL-001",
    subject: "Request for extension",
    category: "contract",
    letterType: "informative",
    replyStatus: "not_started",
    replyDueDate: null,
    replyNotes: null,
    statusHistory: null,
    eotDaysClaimed: null,
    eotDaysGranted: null,
    eotStatus: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── list ───────────────────────────────────────────────────────────────────
describe("correspondence.list", () => {
  it("composes filters and an insensitive OR search within the project", async () => {
    member("engineer");
    anyDb.correspondence.findMany.mockResolvedValue([]);
    const caller = createCaller(correspondenceRouter, USER);

    await caller.list({
      projectId: "p-1",
      direction: "incoming",
      category: "qc",
      letterType: "actionable",
      q: "delay",
    });
    expect(anyDb.correspondence.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      direction: "incoming",
      category: "qc",
      letterType: "actionable",
      OR: [
        { subject: { contains: "delay", mode: "insensitive" } },
        { theirRef: { contains: "delay", mode: "insensitive" } },
        { ourRef: { contains: "delay", mode: "insensitive" } },
        { fromName: { contains: "delay", mode: "insensitive" } },
      ],
    });
  });

  it("overdue = actionable + past due + not yet started/in progress", async () => {
    member("engineer");
    anyDb.correspondence.findMany.mockResolvedValue([]);
    const caller = createCaller(correspondenceRouter, USER);

    await caller.list({ projectId: "p-1", overdue: true });
    const where = anyDb.correspondence.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe("p-1");
    expect(where.letterType).toBe("actionable");
    expect(where.replyStatus).toEqual({ in: ["not_started", "in_progress"] });
    expect(where.replyDueDate).toEqual({ lt: expect.any(Date) });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(correspondenceRouter, USER);
    await expectTRPCError(caller.list({ projectId: "p-1" }), "FORBIDDEN");
    expect(anyDb.correspondence.findMany).not.toHaveBeenCalled();
  });
});

// ─── get / getThread ────────────────────────────────────────────────────────
describe("correspondence.get / getThread", () => {
  it("get NOT_FOUNDs a missing letter", async () => {
    member("engineer");
    anyDb.correspondence.findUnique.mockResolvedValue(null);
    const caller = createCaller(correspondenceRouter, USER);
    await expectTRPCError(caller.get({ id: "nope" }), "NOT_FOUND");
  });

  it("get FORBIDDENs a letter from a foreign project (IDOR)", async () => {
    member(null);
    anyDb.correspondence.findUnique.mockResolvedValue(letter({ projectId: "p-other" }));
    const caller = createCaller(correspondenceRouter, USER);
    await expectTRPCError(caller.get({ id: "L-1" }), "FORBIDDEN");
  });

  it("getThread returns the letter with its replies, scoped by membership", async () => {
    member("engineer");
    const row = letter({
      replies: [{ id: "L-2", subject: "RE: Request for extension" }],
      repliesTo: null,
    });
    anyDb.correspondence.findUnique.mockResolvedValue(row);
    const caller = createCaller(correspondenceRouter, USER);

    const res = await caller.getThread({ letterId: "L-1" });
    expect(res.letter.replies).toHaveLength(1);

    member(null);
    await expectTRPCError(caller.getThread({ letterId: "L-1" }), "FORBIDDEN");
  });
});

// ─── create ─────────────────────────────────────────────────────────────────
describe("correspondence.create", () => {
  const baseInput = {
    projectId: "p-1",
    subject: "Request for extension",
  };

  it("auto-generates a padded sequential ourRef when none is given", async () => {
    member("engineer");
    anyDb.correspondence.count.mockResolvedValue(41);
    const caller = createCaller(correspondenceRouter, USER);

    await caller.create(baseInput);
    expect(anyDb.correspondence.count).toHaveBeenCalledWith({
      where: { projectId: "p-1" },
    });
    const year = new Date().getFullYear();
    expect(anyDb.correspondence.create.mock.calls[0][0].data.ourRef).toBe(
      `COR-${year}-0042`,
    );
  });

  it("keeps an explicit ourRef and skips the count query", async () => {
    member("engineer");
    const caller = createCaller(correspondenceRouter, USER);

    await caller.create({ ...baseInput, ourRef: "COR-2020-0009" });
    expect(anyDb.correspondence.count).not.toHaveBeenCalled();
    expect(anyDb.correspondence.create.mock.calls[0][0].data.ourRef).toBe("COR-2020-0009");
  });

  it("EOT claims start in eotStatus 'submitted' and seed the status history", async () => {
    member("engineer");
    const caller = createCaller(correspondenceRouter, USER);

    await caller.create({
      ...baseInput,
      letterType: "eot_claim",
      eotDaysClaimed: 14,
      replyDueDate: "2026-03-01T00:00:00.000Z",
    });
    const data = anyDb.correspondence.create.mock.calls[0][0].data;
    expect(data.eotStatus).toBe("submitted");
    expect(data.eotDaysClaimed).toBe(14);
    expect(data.replyDueDate).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    expect(JSON.parse(data.statusHistory)).toEqual([
      { status: "created", date: expect.any(String), userId: "user-1" },
    ]);
  });

  it("EOT claims for other letter types leave eotStatus null", async () => {
    member("engineer");
    const caller = createCaller(correspondenceRouter, USER);

    await caller.create({ ...baseInput, letterType: "actionable" });
    expect(anyDb.correspondence.create.mock.calls[0][0].data.eotStatus).toBeNull();
  });

  it("rejects a negative eotDaysClaimed (regression)", async () => {
    member("engineer");
    const caller = createCaller(correspondenceRouter, USER);

    await expectTRPCError(
      caller.create({ ...baseInput, letterType: "eot_claim", eotDaysClaimed: -5 }),
      "BAD_REQUEST",
    );
    expect(anyDb.correspondence.create).not.toHaveBeenCalled();
  });

  it("enforces the 10MB base64 file cap", async () => {
    member("engineer");
    const caller = createCaller(correspondenceRouter, USER);

    // ceil(14e6 × 3/4) ≈ 10.5MB > 10MB.
    await expectTRPCError(
      caller.create({ ...baseInput, fileData: "x".repeat(14_000_000), fileName: "big.pdf" }),
      "BAD_REQUEST",
    );
    expect(anyDb.correspondence.create).not.toHaveBeenCalled();

    // ceil(13e6 × 3/4) = 9.75MB → allowed.
    await caller.create({ ...baseInput, fileData: "x".repeat(13_000_000) });
    expect(anyDb.correspondence.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a repliesToId pointing at a foreign project's letter (regression)", async () => {
    member("engineer");
    anyDb.correspondence.findFirst.mockResolvedValue(null);
    const caller = createCaller(correspondenceRouter, USER);

    await expectTRPCError(
      caller.create({ ...baseInput, repliesToId: "foreign-letter" }),
      "NOT_FOUND",
    );
    expect(anyDb.correspondence.create).not.toHaveBeenCalled();
  });

  it("accepts a repliesToId within the same project", async () => {
    member("engineer");
    anyDb.correspondence.findFirst.mockResolvedValue({ id: "L-0" });
    const caller = createCaller(correspondenceRouter, USER);

    await caller.create({ ...baseInput, repliesToId: "L-0" });
    expect(anyDb.correspondence.create.mock.calls[0][0].data.repliesToId).toBe("L-0");
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(correspondenceRouter, USER);
    await expectTRPCError(caller.create(baseInput), "FORBIDDEN");
    expect(anyDb.correspondence.create).not.toHaveBeenCalled();
  });
});

// ─── updateReply ────────────────────────────────────────────────────────────
describe("correspondence.updateReply", () => {
  it("appends the status change to the status history with the actor's identity", async () => {
    member("engineer");
    anyDb.correspondence.findUnique.mockResolvedValue(
      letter({
        replyStatus: "not_started",
        statusHistory: JSON.stringify([
          { status: "created", date: "2026-01-01T00:00:00.000Z", userId: "user-1" },
        ]),
      }),
    );
    const caller = createCaller(correspondenceRouter, USER);

    await caller.updateReply({ id: "L-1", replyStatus: "in_progress" });
    const data = anyDb.correspondence.update.mock.calls[0][0].data;
    expect(data.replyStatus).toBe("in_progress");
    const history = JSON.parse(data.statusHistory);
    expect(history).toHaveLength(2);
    expect(history[1]).toEqual({
      status: "in_progress",
      date: expect.any(String),
      userId: "user-1",
      userName: "Sita Sharma",
    });
  });

  it("auto-stamps replySentDate when the reply is marked sent", async () => {
    member("engineer");
    anyDb.correspondence.findUnique.mockResolvedValue(letter({ replyStatus: "drafted" }));
    const caller = createCaller(correspondenceRouter, USER);

    await caller.updateReply({ id: "L-1", replyStatus: "sent" });
    const data = anyDb.correspondence.update.mock.calls[0][0].data;
    expect(data.replySentDate).toBeInstanceOf(Date);
  });

  it("enforces the same 10MB cap on reply files (regression)", async () => {
    member("engineer");
    anyDb.correspondence.findUnique.mockResolvedValue(letter());
    const caller = createCaller(correspondenceRouter, USER);

    await expectTRPCError(
      caller.updateReply({
        id: "L-1",
        replyStatus: "drafted",
        replyFileData: "x".repeat(14_000_000),
        replyFileName: "reply.pdf",
      }),
      "BAD_REQUEST",
    );
    expect(anyDb.correspondence.update).not.toHaveBeenCalled();

    // Small reply file is stored.
    await caller.updateReply({
      id: "L-1",
      replyFileData: "small",
      replyFileName: "reply.pdf",
      replyFileType: "application/pdf",
    });
    expect(anyDb.correspondence.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        replyFileData: "small",
        replyFileName: "reply.pdf",
        replyFileType: "application/pdf",
      }),
    );
  });

  it("FORBIDDENs updates on a foreign project's letter (IDOR)", async () => {
    member(null);
    anyDb.correspondence.findUnique.mockResolvedValue(letter({ projectId: "p-other" }));
    const caller = createCaller(correspondenceRouter, USER);

    await expectTRPCError(
      caller.updateReply({ id: "L-1", replyStatus: "sent" }),
      "FORBIDDEN",
    );
    expect(anyDb.correspondence.update).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a missing letter", async () => {
    member("engineer");
    anyDb.correspondence.findUnique.mockResolvedValue(null);
    const caller = createCaller(correspondenceRouter, USER);
    await expectTRPCError(caller.updateReply({ id: "nope" }), "NOT_FOUND");
  });
});

// ─── stats ──────────────────────────────────────────────────────────────────
describe("correspondence.stats", () => {
  it("classifies actionable letters and counts categories across ALL letters", async () => {
    member("engineer");
    anyDb.correspondence.findMany.mockResolvedValue([
      letter({ id: "1", letterType: "actionable", replyDueDate: daysAgo(2), replyStatus: "not_started", category: "contract" }), // overdue
      letter({ id: "2", letterType: "actionable", replyDueDate: inDays(3), replyStatus: "in_progress", category: "qc" }), // pending
      letter({ id: "3", letterType: "actionable", replyDueDate: daysAgo(1), replyStatus: "in_progress", category: "qc" }), // overdue
      letter({ id: "4", letterType: "actionable", replyStatus: "drafted", category: "design" }),
      letter({ id: "5", letterType: "actionable", replyStatus: "sent", category: "site" }),
      letter({ id: "6", letterType: "actionable", replyStatus: "closed", category: "site" }),
      letter({ id: "7", letterType: "informative", replyDueDate: daysAgo(5), replyStatus: "not_started", category: "other" }), // not overdue
      letter({ id: "8", direction: "outgoing", letterType: "informative", category: "other" }),
    ]);
    const caller = createCaller(correspondenceRouter, USER);

    const res = await caller.stats({ projectId: "p-1" });
    expect(res.total).toBe(8);
    expect(res.incoming).toBe(7);
    expect(res.outgoing).toBe(1);
    expect(res.actionable).toBe(6);
    expect(res.informative).toBe(2);
    expect(res.overdue).toBe(2);
    expect(res.pendingReply).toBe(3); // not_started + in_progress (incl. overdue)
    expect(res.drafted).toBe(1);
    expect(res.sent).toBe(1);
    expect(res.closed).toBe(1);
    expect(res.byCategory).toEqual({ contract: 1, qc: 2, design: 1, site: 2, other: 2 });
    expect(res.overdueLetters.map((l: any) => l.id)).toEqual(["1", "3"]);
  });

  it("queries only this project's letters and FORBIDDENs non-members", async () => {
    member("engineer");
    anyDb.correspondence.findMany.mockResolvedValue([]);
    const caller = createCaller(correspondenceRouter, USER);

    await caller.stats({ projectId: "p-1" });
    expect(anyDb.correspondence.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
    });

    member(null);
    await expectTRPCError(caller.stats({ projectId: "p-1" }), "FORBIDDEN");
  });
});

// ─── delete ─────────────────────────────────────────────────────────────────
describe("correspondence.delete", () => {
  it("NOT_FOUNDs a letter that exists in ANOTHER project (IDOR regression pin)", async () => {
    // Caller has write access to p-1 and passes id of a p-2 letter.
    member("engineer");
    anyDb.correspondence.findFirst.mockResolvedValue(null);
    const caller = createCaller(correspondenceRouter, USER);

    await expectTRPCError(
      caller.delete({ id: "L-1", projectId: "p-1" }),
      "NOT_FOUND",
    );
    expect(anyDb.correspondence.delete).not.toHaveBeenCalled();
  });

  it("deletes after verifying ownership, and FORBIDDENs read-only roles", async () => {
    member("engineer");
    anyDb.correspondence.findFirst.mockResolvedValue({ id: "L-1" });
    const caller = createCaller(correspondenceRouter, USER);

    await caller.delete({ id: "L-1", projectId: "p-1" });
    expect(anyDb.correspondence.delete).toHaveBeenCalledWith({ where: { id: "L-1" } });

    member("client");
    await expectTRPCError(caller.delete({ id: "L-1", projectId: "p-1" }), "FORBIDDEN");
  });
});

// ─── updateEot ──────────────────────────────────────────────────────────────
describe("correspondence.updateEot", () => {
  it("updates status/days granted and preserves replyNotes when no notes are given", async () => {
    member("project_manager");
    anyDb.correspondence.findUnique.mockResolvedValue(
      letter({ letterType: "eot_claim", eotStatus: "submitted", replyNotes: "Under review" }),
    );
    const caller = createCaller(correspondenceRouter, USER);

    await caller.updateEot({ id: "L-1", eotStatus: "partially_approved", eotDaysGranted: 7 });
    expect(anyDb.correspondence.update).toHaveBeenCalledWith({
      where: { id: "L-1" },
      data: {
        eotStatus: "partially_approved",
        eotDaysGranted: 7,
        replyNotes: "Under review", // input.notes || existing.replyNotes
      },
    });
  });

  it("rejects a negative eotDaysGranted (regression)", async () => {
    member("project_manager");
    anyDb.correspondence.findUnique.mockResolvedValue(letter());
    const caller = createCaller(correspondenceRouter, USER);

    await expectTRPCError(
      caller.updateEot({ id: "L-1", eotStatus: "approved", eotDaysGranted: -3 }),
      "BAD_REQUEST",
    );
    expect(anyDb.correspondence.update).not.toHaveBeenCalled();
  });

  it("rejects statuses outside the enum (zod) and FORBIDDENs foreign projects", async () => {
    member("project_manager");
    const caller = createCaller(correspondenceRouter, USER);

    await expectTRPCError(
      caller.updateEot({ id: "L-1", eotStatus: "maybe" } as any),
      "BAD_REQUEST",
    );

    member(null);
    anyDb.correspondence.findUnique.mockResolvedValue(letter({ projectId: "p-other" }));
    await expectTRPCError(
      caller.updateEot({ id: "L-1", eotStatus: "approved" }),
      "FORBIDDEN",
    );
    expect(anyDb.correspondence.update).not.toHaveBeenCalled();
  });
});
