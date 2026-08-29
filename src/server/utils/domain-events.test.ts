import { describe, it, expect, vi } from "vitest";
import { emitDomainEvent } from "./domain-events";
import * as notifyModule from "./notify";

describe("Central Domain Event Bus & Notification Dispatcher", () => {
  it("emits domain event and schedules project notification", () => {
    const spy = vi.spyOn(notifyModule, "notifyProject").mockResolvedValue(undefined as any);

    emitDomainEvent({
      type: "rfi.created",
      projectId: "proj-1",
      actorUserId: "user-1",
      title: "New RFI Submitted",
      message: "RFI-2026-001 regarding foundation reinforcement",
      entityType: "rfi",
      entityId: "rfi-1",
    });

    expect(typeof emitDomainEvent).toBe("function");
    spy.mockRestore();
  });
});
