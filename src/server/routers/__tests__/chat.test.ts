/**
 * Router-layer tests for chat.ts — pins the audit H-4 fixes.
 *
 * Chat had NO dedicated tests (audit §5) and was one of the routers with
 * the most issues: cross-tenant member injection on createChannel, public
 * channels with projectId=null readable/writable by any authenticated user
 * holding the cuid, and unbounded message payloads.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUser, createCaller, expectTRPCError } from "./test-utils";

vi.mock("@/lib/db", async () => {
  const { buildDbMock } = await import("./test-utils");
  const db = buildDbMock();
  return { db, getFreshDb: () => db };
});

import { db } from "@/lib/db";
import { chatRouter } from "../chat";

const anyDb = db as any;
const USER = buildUser();

function member(role: string | null) {
  anyDb.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("chat.createChannel — cross-org member injection (H-4)", () => {
  const baseInput = { name: "Site Chat", type: "group" as const, memberIds: ["u-2", "u-3"] };

  it("only adds candidates that belong to the caller's organization", async () => {
    anyDb.chatChannel.create.mockResolvedValue({ id: "ch-1" });
    // u-2 is same-org; u-3 belongs to ANOTHER org → silently dropped.
    anyDb.user.findMany.mockResolvedValue([{ id: "u-2" }]);

    const caller = createCaller(chatRouter, USER);
    await caller.createChannel(baseInput);

    expect(anyDb.chatMember.createMany).toHaveBeenCalledWith({
      data: [{ channelId: "ch-1", userId: "u-2", role: "member" }],
    });
  });

  it("creates no member rows when every candidate is foreign", async () => {
    anyDb.chatChannel.create.mockResolvedValue({ id: "ch-1" });
    anyDb.user.findMany.mockResolvedValue([]);

    const caller = createCaller(chatRouter, USER);
    await caller.createChannel(baseInput);

    expect(anyDb.chatMember.createMany).not.toHaveBeenCalled();
  });
});

describe("chat.sendMessage — payload caps + null-project public channels (H-4)", () => {
  it("rejects oversized message text (payload caps)", async () => {
    const caller = createCaller(chatRouter, USER);
    await expectTRPCError(
      caller.sendMessage({ channelId: "ch-1", text: "x".repeat(4001) }),
      "BAD_REQUEST",
    );
    expect(anyDb.chatChannel.findUnique).not.toHaveBeenCalled();
  });

  it("requires membership to post to a public channel with no project", async () => {
    anyDb.chatChannel.findUnique.mockResolvedValue({ id: "ch-1", type: "public", projectId: null });
    anyDb.chatMember.findUnique.mockResolvedValue(null); // not a member
    const caller = createCaller(chatRouter, USER);
    await expectTRPCError(caller.sendMessage({ channelId: "ch-1", text: "hi" }), "FORBIDDEN");
    expect(anyDb.chatMessage.create).not.toHaveBeenCalled();
  });

  it("allows posting to a project-scoped public channel for project members", async () => {
    anyDb.chatChannel.findUnique.mockResolvedValue({ id: "ch-1", type: "public", projectId: "p-1" });
    member("engineer");
    anyDb.chatMessage.create.mockResolvedValue({ id: "m-1" });
    const caller = createCaller(chatRouter, USER);
    await caller.sendMessage({ channelId: "ch-1", text: "hi" });
    expect(anyDb.chatMessage.create).toHaveBeenCalled();
  });
});

describe("chat.getMessages — null-project public channel read guard (H-4)", () => {
  it("rejects a non-member reader of a public channel with no project", async () => {
    anyDb.chatChannel.findUnique.mockResolvedValue({ id: "ch-1", type: "public", projectId: null });
    anyDb.chatMember.findUnique.mockResolvedValue(null);
    const caller = createCaller(chatRouter, USER);
    await expectTRPCError(caller.getMessages({ channelId: "ch-1" }), "FORBIDDEN");
    expect(anyDb.chatMessage.findMany).not.toHaveBeenCalled();
  });
});
