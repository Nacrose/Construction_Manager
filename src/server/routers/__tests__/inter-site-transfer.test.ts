import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/fiscal-year-lock", () => ({
  assertNotLocked: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";
import { interSiteTransferRouter } from "../inter-site-transfer";

const anyDb = db as any;
const USER = buildUser({ id: "u-1", organizationId: "org-1" });

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("interSiteTransfer.list", () => {
  it("rejects user without an organization", async () => {
    const loner = buildUser({ organizationId: null });
    const caller = createCaller(interSiteTransferRouter, loner);
    await expectTRPCError(caller.list({}), "BAD_REQUEST");
  });

  it("queries transfers filtered by organization", async () => {
    anyDb.interSiteTransfer.findMany.mockResolvedValue([
      { id: "t-1", transferNo: "ITC-2026-0001", quantity: 50, status: "received" },
    ]);

    const caller = createCaller(interSiteTransferRouter, USER);
    const res = await caller.list({});
    expect(res.transfers.length).toBe(1);
    expect(res.transfers[0].transferNo).toBe("ITC-2026-0001");
  });
});

describe("interSiteTransfer.transferMaterial", () => {
  it("rejects transfer between identical origin and destination", async () => {
    const caller = createCaller(interSiteTransferRouter, USER);
    await expectTRPCError(
      caller.transferMaterial({
        originProjectId: "proj-1",
        destinationProjectId: "proj-1",
        materialId: "mat-1",
        quantity: 50,
      }),
      "BAD_REQUEST"
    );
  });

  it("rejects non-member callers", async () => {
    member(null);
    const caller = createCaller(interSiteTransferRouter, USER);
    await expectTRPCError(
      caller.transferMaterial({
        originProjectId: "proj-1",
        destinationProjectId: "proj-2",
        materialId: "mat-1",
        quantity: 50,
      }),
      "FORBIDDEN"
    );
  });
});
