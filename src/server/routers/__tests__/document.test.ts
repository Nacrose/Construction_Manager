/**
 * Router-layer tests for document.ts (documents, drawings, revisions,
 * markups, drawing sets).
 *
 * Pins:
 *   - listDocuments/listDrawings/listSets: project scoping (+ type/
 *     discipline/set filters and search OR clauses)
 *   - create/update/delete document & drawing: ownership re-checks on the
 *     CHILD row's own projectId (cross-project IDOR → FORBIDDEN), non-member
 *     gate, file-size cap (20M base64 chars)
 *   - createDrawing: initial DrawingRevision audit row ("Initial upload",
 *     issuedBy, createdById); ganttTaskId must belong to the SAME project
 *     (regression: foreign task ids were accepted and listDrawings'
 *     ganttTask include leaked the other project's task code/name)
 *   - addRevision: revision record + drawing reset (current revision,
 *     issuedDate, approvalStatus "pending", approvedAt/By/Notes cleared) —
 *     a new revision always requires re-approval
 *   - approveDrawing: approved_* stamps for approvals; rejected clears
 *     approvedAt/approvedById
 *   - createRfiFromDrawing: RFI number from per-day count; drawing must
 *     belong to the caller's project (regression: foreign drawingId was
 *     accepted, pinning an RFI onto another project's drawing)
 *   - getRevisions: next-revision suggestion (letter + zero-padded numeric)
 *   - markups & revision files: authorization through the owning drawing's
 *     project; revision-scoped markup listing keeps null-revision markups
 *   - assignToSet: the set must belong to the drawing's project
 *     (regression: foreign set ids were accepted); null unassigns
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
import { documentRouter } from "../document";

const anyDb = db as any;
const USER = buildUser({ id: "user-1", name: "Sita Sharma" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

function drawing(overrides: Record<string, unknown> = {}) {
  return {
    id: "d-1",
    projectId: "p-1",
    number: "DWG-001",
    title: "Footing details",
    revision: "A",
    approvalStatus: "pending",
    approvedAt: null,
    approvedById: null,
    approvalNotes: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── documents ──────────────────────────────────────────────────────────────
describe("document.listDocuments", () => {
  it("scopes documents and transmittals to the project, applying type + search filters", async () => {
    member("engineer");
    anyDb.document.findMany.mockResolvedValue([]);
    anyDb.transmittal.findMany.mockResolvedValue([]);
    const caller = createCaller(documentRouter, USER);

    await caller.listDocuments({ projectId: "p-1", type: "spec", q: "footing" });
    expect(anyDb.document.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      type: "spec",
      OR: [{ number: { contains: "footing" } }, { title: { contains: "footing" } }],
    });
    expect(anyDb.transmittal.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(documentRouter, USER);
    await expectTRPCError(caller.listDocuments({ projectId: "p-1" }), "FORBIDDEN");
    expect(anyDb.document.findMany).not.toHaveBeenCalled();
  });
});

describe("document.createDocument", () => {
  it("creates with zod defaults (type general, revision A) and a Date issuedDate", async () => {
    member("engineer");
    const caller = createCaller(documentRouter, USER);

    await caller.createDocument({
      projectId: "p-1",
      number: "DOC-001",
      title: "Soil report",
      issuedDate: "2026-02-01T00:00:00.000Z",
    });
    const data = anyDb.document.create.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        projectId: "p-1",
        number: "DOC-001",
        title: "Soil report",
        type: "general",
        revision: "A",
        issuedDate: new Date("2026-02-01T00:00:00.000Z"),
      }),
    );
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(documentRouter, USER);
    await expectTRPCError(
      caller.createDocument({ projectId: "p-1", number: "DOC-001", title: "x" }),
      "FORBIDDEN",
    );
    expect(anyDb.document.create).not.toHaveBeenCalled();
  });
});

describe("document.updateDocument / deleteDocument", () => {
  it("FORBIDDENs updating a document that belongs to a foreign project (IDOR)", async () => {
    member(null);
    anyDb.document.findUnique.mockResolvedValue({ projectId: "p-other" });
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(
      caller.updateDocument({ itemId: "doc-1", title: "hijack" }),
      "FORBIDDEN",
    );
    expect(anyDb.document.update).not.toHaveBeenCalled();
  });

  it("NOT_FOUNDs a missing document", async () => {
    member("engineer");
    anyDb.document.findUnique.mockResolvedValue(null);
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(caller.updateDocument({ itemId: "nope", title: "x" }), "NOT_FOUND");
  });

  it("FORBIDDENs deleting a document from a foreign project (IDOR)", async () => {
    member(null);
    anyDb.document.findUnique.mockResolvedValue({ projectId: "p-other" });
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(caller.deleteDocument({ itemId: "doc-1" }), "FORBIDDEN");
    expect(anyDb.document.delete).not.toHaveBeenCalled();
  });
});

// ─── drawings ───────────────────────────────────────────────────────────────
describe("document.listDrawings", () => {
  it("applies discipline / set / search filters within the project scope", async () => {
    member("engineer");
    anyDb.drawing.findMany.mockResolvedValue([]);
    const caller = createCaller(documentRouter, USER);

    await caller.listDrawings({
      projectId: "p-1",
      discipline: "structural",
      setId: "none",
      q: "footing",
    });
    expect(anyDb.drawing.findMany.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      discipline: "structural",
      drawingSetId: null,
      OR: [{ number: { contains: "footing" } }, { title: { contains: "footing" } }],
    });

    await caller.listDrawings({ projectId: "p-1", setId: "set-1" });
    expect(anyDb.drawing.findMany.mock.calls[1][0].where).toEqual({
      projectId: "p-1",
      drawingSetId: "set-1",
    });

    await caller.listDrawings({ projectId: "p-1", setId: "all", discipline: "all" });
    expect(anyDb.drawing.findMany.mock.calls[2][0].where).toEqual({ projectId: "p-1" });
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(documentRouter, USER);
    await expectTRPCError(caller.listDrawings({ projectId: "p-1" }), "FORBIDDEN");
    expect(anyDb.drawing.findMany).not.toHaveBeenCalled();
  });

  it("lists org-wide drawings across projects when projectId is omitted", async () => {
    anyDb.drawing.findMany.mockResolvedValue([]);
    const caller = createCaller(documentRouter, USER);

    await caller.listDrawings({});
    expect(anyDb.drawing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          project: { organizationId: USER.organizationId },
        },
      })
    );
  });
});

describe("document.createDrawing", () => {
  const baseInput = {
    projectId: "p-1",
    number: "DWG-001",
    title: "Footing details",
  };

  it("creates the drawing AND an initial revision record for the audit trail", async () => {
    member("engineer");
    anyDb.drawing.create.mockResolvedValue({ id: "d-1" });
    const caller = createCaller(documentRouter, USER);

    await caller.createDrawing({ ...baseInput, fileName: "f.pdf", fileType: "application/pdf" });
    expect(anyDb.drawing.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        projectId: "p-1",
        number: "DWG-001",
        revision: "A", // zod default
        ganttTaskId: null,
        createdById: "user-1",
      }),
    );
    expect(anyDb.drawingRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          drawingId: "d-1",
          revision: "A",
          description: "Initial upload",
          issuedBy: "Sita Sharma",
          createdById: "user-1",
        }),
      }),
    );
  });

  it("accepts a gantt task that belongs to the same project", async () => {
    member("engineer");
    anyDb.ganttTask.findFirst.mockResolvedValue({ id: "gt-1" });
    anyDb.drawing.create.mockResolvedValue({ id: "d-1" });
    const caller = createCaller(documentRouter, USER);

    await caller.createDrawing({ ...baseInput, ganttTaskId: "gt-1" });
    expect(anyDb.ganttTask.findFirst).toHaveBeenCalledWith({
      where: { id: "gt-1", projectId: "p-1" },
      select: { id: true },
    });
    expect(anyDb.drawing.create.mock.calls[0][0].data.ganttTaskId).toBe("gt-1");
  });

  it("rejects a ganttTaskId from a foreign project (regression: task leak via include)", async () => {
    member("engineer");
    anyDb.ganttTask.findFirst.mockResolvedValue(null);
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(
      caller.createDrawing({ ...baseInput, ganttTaskId: "foreign-task" }),
      "NOT_FOUND",
    );
    expect(anyDb.drawing.create).not.toHaveBeenCalled();
  });

  it("rejects file payloads over the 20M base64 cap (zod)", async () => {
    member("engineer");
    const caller = createCaller(documentRouter, USER);
    await expectTRPCError(
      caller.createDrawing({ ...baseInput, fileData: "x".repeat(20_000_001) }),
      "BAD_REQUEST",
    );
    expect(anyDb.drawing.create).not.toHaveBeenCalled();
  });

  it("FORBIDDENs non-members", async () => {
    member(null);
    const caller = createCaller(documentRouter, USER);
    await expectTRPCError(caller.createDrawing(baseInput), "FORBIDDEN");
    expect(anyDb.drawing.create).not.toHaveBeenCalled();
  });
});

describe("document.updateDrawing / deleteDrawing", () => {
  it("FORBIDDENs updating a drawing from a foreign project (IDOR)", async () => {
    member(null);
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-other" });
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(
      caller.updateDrawing({ itemId: "d-1", title: "hijack" }),
      "FORBIDDEN",
    );
    expect(anyDb.drawing.update).not.toHaveBeenCalled();
  });

  it("applies scale/status/revision updates after the ownership check", async () => {
    member("engineer");
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-1" });
    const caller = createCaller(documentRouter, USER);

    await caller.updateDrawing({ itemId: "d-1", status: "superseded", scaleValue: 100 });
    expect(anyDb.drawing.update).toHaveBeenCalledWith({
      where: { id: "d-1" },
      data: { status: "superseded", scaleValue: 100 },
    });
  });

  it("FORBIDDENs deleting a drawing from a foreign project (IDOR)", async () => {
    member(null);
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-other" });
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(caller.deleteDrawing({ itemId: "d-1" }), "FORBIDDEN");
    expect(anyDb.drawing.delete).not.toHaveBeenCalled();
  });
});

describe("document.getDrawing", () => {
  it("FORBIDDENs a drawing from a foreign project", async () => {
    member(null);
    anyDb.drawing.findUnique.mockResolvedValue(drawing({ projectId: "p-other" }));
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(caller.getDrawing({ drawingId: "d-1" }), "FORBIDDEN");
  });

  it("returns the drawing with revision history and linked RFIs", async () => {
    member("engineer");
    const row = drawing();
    anyDb.drawing.findUnique.mockResolvedValue(row);
    const caller = createCaller(documentRouter, USER);

    const res = await caller.getDrawing({ drawingId: "d-1" });
    expect(res.drawing).toBe(row);
  });
});

// ─── revisions & approval ───────────────────────────────────────────────────
describe("document.addRevision", () => {
  it("creates the revision record and RESETS the drawing's approval state", async () => {
    member("engineer");
    anyDb.drawing.findUnique.mockResolvedValue(
      drawing({ approvalStatus: "approved_client", approvedAt: new Date(), approvedById: "u9" }),
    );
    const caller = createCaller(documentRouter, USER);

    await caller.addRevision({
      drawingId: "d-1",
      revision: "C",
      description: "Rebar spacing fix",
      fileName: "f2.pdf",
      fileType: "application/pdf",
    });

    expect(anyDb.drawingRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          drawingId: "d-1",
          revision: "C",
          description: "Rebar spacing fix",
          issuedBy: "Sita Sharma",
          createdById: "user-1",
        }),
      }),
    );
    // A new revision must go through approval again.
    expect(anyDb.drawing.update).toHaveBeenCalledWith({
      where: { id: "d-1" },
      data: expect.objectContaining({
        revision: "C",
        fileName: "f2.pdf",
        fileType: "application/pdf",
        issuedDate: expect.any(Date),
        approvalStatus: "pending",
        approvedAt: null,
        approvedById: null,
        approvalNotes: null,
      }),
    });
  });

  it("FORBIDDENs adding a revision to a foreign project's drawing (IDOR)", async () => {
    member(null);
    anyDb.drawing.findUnique.mockResolvedValue(drawing({ projectId: "p-other" }));
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(
      caller.addRevision({ drawingId: "d-1", revision: "C" }),
      "FORBIDDEN",
    );
    expect(anyDb.drawingRevision.create).not.toHaveBeenCalled();
  });

  it("rejects an empty revision label (zod min(1))", async () => {
    member("engineer");
    const caller = createCaller(documentRouter, USER);
    await expectTRPCError(
      caller.addRevision({ drawingId: "d-1", revision: "" }),
      "BAD_REQUEST",
    );
  });
});

describe("document.approveDrawing", () => {
  it("stamps approvedAt/approvedById/notes for an approval decision", async () => {
    member("coordinator");
    anyDb.drawing.findUnique.mockResolvedValue(drawing());
    const caller = createCaller(documentRouter, USER);

    await caller.approveDrawing({
      drawingId: "d-1",
      approvalStatus: "approved_internal",
      notes: "Checked against site survey",
    });
    expect(anyDb.drawing.update).toHaveBeenCalledWith({
      where: { id: "d-1" },
      data: expect.objectContaining({
        approvalStatus: "approved_internal",
        approvedAt: expect.any(Date),
        approvedById: "user-1",
        approvalNotes: "Checked against site survey",
      }),
    });
  });

  it("rejection clears approvedAt/approvedById", async () => {
    member("project_manager");
    anyDb.drawing.findUnique.mockResolvedValue(drawing());
    const caller = createCaller(documentRouter, USER);

    await caller.approveDrawing({ drawingId: "d-1", approvalStatus: "rejected" });
    expect(anyDb.drawing.update).toHaveBeenCalledWith({
      where: { id: "d-1" },
      data: expect.objectContaining({
        approvalStatus: "rejected",
        approvedAt: null,
        approvedById: null,
        approvalNotes: null,
      }),
    });
  });

  it("rejects statuses outside the enum (zod)", async () => {
    member("project_manager");
    const caller = createCaller(documentRouter, USER);
    await expectTRPCError(
      caller.approveDrawing({ drawingId: "d-1", approvalStatus: "maybe" } as any),
      "BAD_REQUEST",
    );
    expect(anyDb.drawing.update).not.toHaveBeenCalled();
  });

  it("FORBIDDENs approving a foreign project's drawing (IDOR)", async () => {
    member(null);
    anyDb.drawing.findUnique.mockResolvedValue(drawing({ projectId: "p-other" }));
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(
      caller.approveDrawing({ drawingId: "d-1", approvalStatus: "approved_client" }),
      "FORBIDDEN",
    );
    expect(anyDb.drawing.update).not.toHaveBeenCalled();
  });
});

// ─── RFI from drawing ───────────────────────────────────────────────────────
describe("document.createRfiFromDrawing", () => {
  const input = {
    projectId: "p-1",
    drawingId: "d-1",
    subject: "Clarify rebar cover",
  };

  it("generates a per-day sequence number and creates the pinned RFI", async () => {
    member("engineer");
    anyDb.drawing.findFirst.mockResolvedValue({ id: "d-1" });
    anyDb.rfi.count.mockResolvedValue(4);
    const caller = createCaller(documentRouter, USER);

    await caller.createRfiFromDrawing({
      ...input,
      pinX: 0.5,
      pinY: 0.25,
      priority: "high",
    });

    // Count is scoped to this project + today.
    expect(anyDb.rfi.count.mock.calls[0][0].where).toEqual({
      projectId: "p-1",
      createdAt: { gte: expect.any(Date) },
    });
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    expect(anyDb.rfi.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        projectId: "p-1",
        number: `RFI-${today}-005`,
        drawingId: "d-1",
        pinX: 0.5,
        pinY: 0.25,
        priority: "high",
        createdById: "user-1",
      }),
    );
  });

  it("rejects a drawingId from a foreign project (regression: RFI pinned onto another project's drawing)", async () => {
    member("engineer");
    anyDb.drawing.findFirst.mockResolvedValue(null);
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(
      caller.createRfiFromDrawing({ ...input, drawingId: "foreign-drawing" }),
      "NOT_FOUND",
    );
    expect(anyDb.rfi.create).not.toHaveBeenCalled();
  });

  it("validates pin coordinates (0..1) and gates non-members", async () => {
    member("engineer");
    anyDb.drawing.findFirst.mockResolvedValue({ id: "d-1" });
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(
      caller.createRfiFromDrawing({ ...input, pinX: 1.5 }),
      "BAD_REQUEST",
    );

    member(null);
    await expectTRPCError(caller.createRfiFromDrawing(input), "FORBIDDEN");
    expect(anyDb.rfi.create).not.toHaveBeenCalled();
  });
});

// ─── revision queries & markups ─────────────────────────────────────────────
describe("document.getRevisions", () => {
  it("suggests the next letter after the highest used revision letter", async () => {
    member("engineer");
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-1", number: "DWG-001" });
    anyDb.drawingRevision.findMany.mockResolvedValue([
      { revision: "B" },
      { revision: "A" },
    ]);
    const caller = createCaller(documentRouter, USER);

    const res = await caller.getRevisions({ drawingId: "d-1" });
    expect(res.nextRevision).toBe("C");
    expect(res.drawingNumber).toBe("DWG-001");
  });

  it("increments zero-padded numeric revisions", async () => {
    member("engineer");
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-1", number: "DWG-001" });
    anyDb.drawingRevision.findMany.mockResolvedValue([{ revision: "02" }]);
    const caller = createCaller(documentRouter, USER);

    const res = await caller.getRevisions({ drawingId: "d-1" });
    expect(res.nextRevision).toBe("03");
  });

  it("FORBIDDENs a foreign project's revision list", async () => {
    member(null);
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-other" });
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(caller.getRevisions({ drawingId: "d-1" }), "FORBIDDEN");
    expect(anyDb.drawingRevision.findMany).not.toHaveBeenCalled();
  });
});

describe("document.getRevisionFile", () => {
  it("authorizes through the revision's drawing project and returns the file", async () => {
    member("engineer");
    anyDb.drawingRevision.findUnique.mockResolvedValue({
      fileData: "abc",
      fileName: "f.pdf",
      fileType: "application/pdf",
      revision: "B",
      description: "desc",
      drawing: { projectId: "p-1" },
    });
    const caller = createCaller(documentRouter, USER);

    const res = await caller.getRevisionFile({ revisionId: "rev-1" });
    expect(res).toEqual({
      fileData: "abc",
      fileName: "f.pdf",
      fileType: "application/pdf",
      revision: "B",
      description: "desc",
    });
  });

  it("FORBIDDENs a revision belonging to a foreign project (IDOR)", async () => {
    member(null);
    anyDb.drawingRevision.findUnique.mockResolvedValue({
      drawing: { projectId: "p-other" },
    });
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(caller.getRevisionFile({ revisionId: "rev-1" }), "FORBIDDEN");
  });
});

describe("document markups", () => {
  it("listMarkups keeps revision-scoped markups AND null-revision (all-revision) ones", async () => {
    member("engineer");
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-1" });
    const caller = createCaller(documentRouter, USER);

    await caller.listMarkups({ drawingId: "d-1", revisionId: "rev-2" });
    expect(anyDb.drawingMarkup.findMany.mock.calls[0][0].where).toEqual({
      drawingId: "d-1",
      OR: [{ revisionId: "rev-2" }, { revisionId: null }],
    });
  });

  it("addMarkup validates coordinates and persists through the ownership check", async () => {
    member("engineer");
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-1" });
    const caller = createCaller(documentRouter, USER);

    await caller.addMarkup({ drawingId: "d-1", type: "cloud", x: 0.1, y: 0.2 });
    expect(anyDb.drawingMarkup.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        drawingId: "d-1",
        revisionId: null,
        type: "cloud",
        x: 0.1,
        y: 0.2,
        color: "#ef4444", // zod default
        createdById: "user-1",
      }),
    );

    await expectTRPCError(
      caller.addMarkup({ drawingId: "d-1", type: "cloud", x: 1.2, y: 0.5 }),
      "BAD_REQUEST",
    );
  });

  it("addMarkup FORBIDDENs markups on a foreign project's drawing", async () => {
    member(null);
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-other" });
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(
      caller.addMarkup({ drawingId: "d-1", type: "cloud", x: 0, y: 0 }),
      "FORBIDDEN",
    );
    expect(anyDb.drawingMarkup.create).not.toHaveBeenCalled();
  });

  it("deleteMarkup authorizes through the markup's drawing (IDOR)", async () => {
    member(null);
    anyDb.drawingMarkup.findUnique.mockResolvedValue({
      id: "mu-1",
      drawing: { projectId: "p-other" },
    });
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(caller.deleteMarkup({ markupId: "mu-1" }), "FORBIDDEN");
    expect(anyDb.drawingMarkup.delete).not.toHaveBeenCalled();
  });
});

// ─── drawing sets ───────────────────────────────────────────────────────────
describe("document sets", () => {
  it("listSets scopes to the project", async () => {
    member("engineer");
    anyDb.drawingSet.findMany.mockResolvedValue([]);
    const caller = createCaller(documentRouter, USER);

    await caller.listSets({ projectId: "p-1" });
    expect(anyDb.drawingSet.findMany.mock.calls[0][0].where).toEqual({ projectId: "p-1" });
  });

  it("createSet FORBIDDENs non-members and defaults description to null", async () => {
    member(null);
    const caller = createCaller(documentRouter, USER);
    await expectTRPCError(
      caller.createSet({ projectId: "p-1", name: "Structural" }),
      "FORBIDDEN",
    );

    member("engineer");
    await caller.createSet({ projectId: "p-1", name: "Structural" });
    expect(anyDb.drawingSet.create).toHaveBeenCalledWith({
      data: { projectId: "p-1", name: "Structural", description: null },
    });
  });

  it("assignToSet rejects a set that belongs to a foreign project (regression)", async () => {
    member("engineer");
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-1" });
    anyDb.drawingSet.findFirst.mockResolvedValue(null);
    const caller = createCaller(documentRouter, USER);

    await expectTRPCError(
      caller.assignToSet({ drawingId: "d-1", setId: "foreign-set" }),
      "NOT_FOUND",
    );
    expect(anyDb.drawing.update).not.toHaveBeenCalled();
  });

  it("assigns to a same-project set and supports unassigning via null", async () => {
    member("engineer");
    anyDb.drawing.findUnique.mockResolvedValue({ projectId: "p-1" });
    anyDb.drawingSet.findFirst.mockResolvedValue({ id: "set-1" });
    const caller = createCaller(documentRouter, USER);

    await caller.assignToSet({ drawingId: "d-1", setId: "set-1" });
    expect(anyDb.drawing.update).toHaveBeenCalledWith({
      where: { id: "d-1" },
      data: { drawingSetId: "set-1" },
    });

    await caller.assignToSet({ drawingId: "d-1", setId: null });
    expect(anyDb.drawing.update).toHaveBeenLastCalledWith({
      where: { id: "d-1" },
      data: { drawingSetId: null },
    });
  });
});
