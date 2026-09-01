/**
 * Router-layer tests for punch-list.ts.
 *
 * Pins:
 *   - list: project scoping + status/severity/q filters (insensitive OR)
 *   - create: happy path (severity default, dueDate YYYY-MM-DD → UTC Date,
 *     createdById, photo passthrough), zod enum/required validation,
 *     read-only roles FORBIDDEN
 *   - updateStatus: linear state machine open → in_progress → resolved →
 *     verified → closed (regression: ANY status could previously be set to
 *     ANY other — closed defects reopened, resolution audit fields
 *     re-stamped/overwritten); stamps resolvedBy/resolvedDate on entry to
 *     "resolved" and verifiedBy/verifiedDate on entry to "verified" while
 *     preserving the earlier stamps on later transitions; NOT_FOUND;
 *     cross-project FORBIDDEN via the item's OWN project
 *   - delete: cross-project IDOR guard (regression: the punch item was
 *     never verified against input.projectId — a writer on project B could
 *     delete project A's defect records by id); read-only FORBIDDEN
 *   - stats: status/severity counts, project-scoped, member-only
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { punchListRouter } from "../punch-list";

const anyDb = db as any;
const USER = buildUser();

// Membership is project-scoped: the caller is a `role` on "p-1" only —
// lookups for any other project (IDOR probes) return null.
function member(role: string | null) {
  anyDb.projectMember.findUnique.mockImplementation(async ({ where }: any) =>
    where.projectId_userId?.projectId === "p-1" && role ? { role } : null,
  );
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "pi-1",
    projectId: "p-1",
    number: "PL-001",
    title: "Honeycomb on column",
    description: "Surface defect",
    severity: "major",
    status: "open",
    resolvedNotes: null,
    resolvedDate: null,
    resolvedBy: null,
    verifiedDate: null,
    verifiedBy: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── list ──────────────────────────────────────────────────────────────────
describe("punchList.list", () => {
  it("scopes to the project and applies status/severity/search filters", async () => {
    member("engineer");
    anyDb.punchItem.findMany.mockResolvedValue([item()]);
    const caller = createCaller(punchListRouter, USER);
    await caller.list({ projectId: "p-1", status: "open", severity: "major", q: "honey" });

    const where = anyDb.punchItem.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe("p-1");
    expect(where.status).toBe("open");
    expect(where.severity).toBe("major");
    expect(where.OR).toEqual([
      { number: { contains: "honey", mode: "insensitive" } },
      { title: { contains: "honey", mode: "insensitive" } },
      { description: { contains: "honey", mode: "insensitive" } },
    ]);
    expect(anyDb.punchItem.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(caller.list({ projectId: "p-1" }), "FORBIDDEN");
    expect(anyDb.punchItem.findMany).not.toHaveBeenCalled();
  });
});

// ─── create ────────────────────────────────────────────────────────────────
describe("punchList.create", () => {
  const baseInput = {
    projectId: "p-1",
    number: "PL-001",
    title: "Honeycomb on column",
    description: "Surface defect at grid B2",
  };

  it("creates the item with defaults, a UTC-normalized dueDate, and the creator stamped", async () => {
    member("engineer");
    anyDb.punchItem.create.mockResolvedValue(item());
    const caller = createCaller(punchListRouter, USER);
    await caller.create({
      ...baseInput,
      dueDate: "2026-09-01",
      photoData: "b64",
      photoName: "photo.jpg",
      photoType: "image/jpeg",
    });

    expect(anyDb.punchItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p-1",
        number: "PL-001",
        severity: "minor", // zod default
        dueDate: new Date("2026-09-01T00:00:00.000Z"),
        createdById: "user-1",
        photoData: "b64",
        photoType: "image/jpeg",
      }),
    });
  });

  it("rejects an invalid severity enum (zod)", async () => {
    member("engineer");
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(
      caller.create({ ...baseInput, severity: "catastrophic" as any }),
      "BAD_REQUEST",
    );
    expect(anyDb.punchItem.create).not.toHaveBeenCalled();
  });

  it("rejects missing required fields (number/title/description)", async () => {
    member("engineer");
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(
      caller.create({ projectId: "p-1", number: "PL-001", title: "" } as any),
      "BAD_REQUEST",
    );
    expect(anyDb.punchItem.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(caller.create(baseInput), "FORBIDDEN");
    expect(anyDb.punchItem.create).not.toHaveBeenCalled();
  });
});

// ─── updateStatus ──────────────────────────────────────────────────────────
describe("punchList.updateStatus", () => {
  it("advances open → in_progress without stamping resolution fields", async () => {
    member("engineer");
    anyDb.punchItem.findUnique.mockResolvedValue(item());
    const caller = createCaller(punchListRouter, USER);
    await caller.updateStatus({ id: "pi-1", status: "in_progress" });

    const data = anyDb.punchItem.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe("in_progress");
    expect(data.resolvedDate).toBeNull();
    expect(data.verifiedDate).toBeNull();
  });

  it("stamps resolvedBy (defaulting to the caller's name) and resolvedDate on entry to resolved", async () => {
    member("engineer");
    anyDb.punchItem.findUnique.mockResolvedValue(item({ status: "in_progress" }));
    const caller = createCaller(punchListRouter, buildUser({ id: "user-1", name: "Site Eng" }));
    await caller.updateStatus({ id: "pi-1", status: "resolved", resolvedNotes: "Re-cast" });

    const data = anyDb.punchItem.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe("resolved");
    expect(data.resolvedBy).toBe("Site Eng");
    expect(data.resolvedDate).toBeInstanceOf(Date);
    expect(data.resolvedNotes).toBe("Re-cast");
  });

  it("stamps verification on entry to verified while PRESERVING the resolution record", async () => {
    member("engineer");
    const resolvedAt = new Date("2026-08-10T00:00:00.000Z");
    anyDb.punchItem.findUnique.mockResolvedValue(
      item({ status: "resolved", resolvedBy: "Site Eng", resolvedDate: resolvedAt, resolvedNotes: "Re-cast" }),
    );
    const caller = createCaller(punchListRouter, USER);
    await caller.updateStatus({ id: "pi-1", status: "verified", verifiedBy: "QA Lead" });

    const data = anyDb.punchItem.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe("verified");
    expect(data.verifiedBy).toBe("QA Lead");
    expect(data.verifiedDate).toBeInstanceOf(Date);
    expect(data.resolvedBy).toBe("Site Eng"); // not overwritten
    expect(data.resolvedDate).toBe(resolvedAt);
  });

  /**
   * REGRESSION (missing state machine): the router accepted ANY status from
   * ANY status — a closed defect could be reopened (closed → open), work
   * could skip states (open → verified), and re-resolving an item re-stamped
   * resolvedBy/resolvedDate, destroying the original resolution record.
   * The state machine enforced here is exactly the linear flow the only UI
   * consumer (punch-status-actions.tsx) drives: open → in_progress →
   * resolved → verified → closed, with closed terminal.
   */
  it("rejects reopening a closed item (closed → open)", async () => {
    member("engineer");
    anyDb.punchItem.findUnique.mockResolvedValue(item({ status: "closed" }));
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(
      caller.updateStatus({ id: "pi-1", status: "open" }),
      "BAD_REQUEST",
    );
    expect(anyDb.punchItem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects skipping states (open → verified, open → resolved)", async () => {
    member("engineer");
    anyDb.punchItem.findUnique.mockResolvedValue(item({ status: "open" }));
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(
      caller.updateStatus({ id: "pi-1", status: "verified" }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.updateStatus({ id: "pi-1", status: "resolved" }),
      "BAD_REQUEST",
    );
    expect(anyDb.punchItem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects regressing a resolved item back to open", async () => {
    member("engineer");
    anyDb.punchItem.findUnique.mockResolvedValue(item({ status: "resolved" }));
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(
      caller.updateStatus({ id: "pi-1", status: "open" }),
      "BAD_REQUEST",
    );
    expect(anyDb.punchItem.updateMany).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a missing item", async () => {
    member("engineer");
    anyDb.punchItem.findUnique.mockResolvedValue(null);
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(caller.updateStatus({ id: "missing", status: "resolved" }), "NOT_FOUND");
  });

  it("FORBIDDENs an item belonging to another project (scoped via the item's OWN project)", async () => {
    member("engineer"); // member of p-1 only
    anyDb.punchItem.findUnique.mockResolvedValue(item({ projectId: "p-other" }));
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(
      caller.updateStatus({ id: "pi-1", status: "in_progress" }),
      "FORBIDDEN",
    );
    expect(anyDb.punchItem.updateMany).not.toHaveBeenCalled();
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    anyDb.punchItem.findUnique.mockResolvedValue(item());
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(
      caller.updateStatus({ id: "pi-1", status: "in_progress" }),
      "FORBIDDEN",
    );
  });
});

// ─── delete ────────────────────────────────────────────────────────────────
describe("punchList.delete", () => {
  /**
   * REGRESSION (cross-project IDOR): delete only checked assertCanWrite on
   * the CALLER-SUPPLIED projectId and then deleted by bare id — the punch
   * item itself was never verified to belong to that project, so a writer
   * on project B could delete project A's defect records by id.
   */
  it("NOT_FOUNDs an item that does not belong to the caller's project (IDOR guard)", async () => {
    member("engineer"); // writer on p-1
    // the id exists — but in another project
    anyDb.punchItem.findFirst.mockResolvedValue(null);
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(
      caller.delete({ id: "pi-foreign", projectId: "p-1" }),
      "NOT_FOUND",
    );
    expect(anyDb.punchItem.delete).not.toHaveBeenCalled();
  });

  it("deletes an item of the caller's project", async () => {
    member("engineer");
    anyDb.punchItem.findFirst.mockResolvedValue({ id: "pi-1" });
    anyDb.punchItem.delete.mockResolvedValue(item());
    const caller = createCaller(punchListRouter, USER);
    const res = await caller.delete({ id: "pi-1", projectId: "p-1" });
    expect(res.ok).toBe(true);
    expect(anyDb.punchItem.findFirst).toHaveBeenCalledWith({
      where: { id: "pi-1", projectId: "p-1" },
      select: { id: true },
    });
    expect(anyDb.punchItem.delete).toHaveBeenCalledWith({ where: { id: "pi-1" } });
  });

  it("FORBIDDENs read-only roles", async () => {
    member("client");
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(caller.delete({ id: "pi-1", projectId: "p-1" }), "FORBIDDEN");
    expect(anyDb.punchItem.delete).not.toHaveBeenCalled();
  });
});

// ─── stats ─────────────────────────────────────────────────────────────────
describe("punchList.stats", () => {
  it("counts items by status and severity, scoped to the project", async () => {
    member("engineer");
    anyDb.punchItem.findMany.mockResolvedValue([
      { status: "open", severity: "critical" },
      { status: "open", severity: "minor" },
      { status: "in_progress", severity: "major" },
      { status: "resolved", severity: "minor" },
      { status: "verified", severity: "minor" },
      { status: "closed", severity: "minor" },
    ]);
    const caller = createCaller(punchListRouter, USER);
    const res = await caller.stats({ projectId: "p-1" });

    expect(anyDb.punchItem.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
    expect(res).toEqual({
      total: 6,
      open: 2,
      inProgress: 1,
      resolved: 1,
      verified: 1,
      closed: 1,
      critical: 1,
      major: 1,
      minor: 4,
    });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(punchListRouter, USER);
    await expectTRPCError(caller.stats({ projectId: "p-1" }), "FORBIDDEN");
  });
});
