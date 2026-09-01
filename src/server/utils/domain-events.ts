/**
 * Central Domain Event Bus & Notification Dispatcher
 *
 * Emits typed domain events across construction operations and automatically
 * orchestrates in-app notifications, project chat announcements, and web push alerts.
 */
import { after } from "next/server";
import { db } from "@/lib/db";
import { notifyProject } from "./notify";
import { sendPushToUser } from "./push";

export type DomainEventType =
  | "rfi.created"
  | "rfi.answered"
  | "ipc.submitted"
  | "ipc.certified"
  | "variation.approved"
  | "submittal.reviewed"
  | "safety.incident_created"
  | "expense.created"
  | "payment.created"
  | "material.po_created"
  | "gl.imbalance.detected"
  /** Generic lifecycle transition (state machine) — model + from/to in metadata. */
  | "lifecycle.transitioned";


export type DomainEventPayload = {
  type: DomainEventType;
  projectId?: string;
  actorUserId?: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  targetRoles?: Array<"project_manager" | "engineer" | "coordinator" | "client" | "inspector">;
  metadata?: Record<string, unknown>;
  postToChannel?: boolean;
};

/**
 * Deliver a domain event to its consumers (in-app notifications, chat
 * channel announcement, web push). Exported so the transactional outbox
 * worker can run the identical pipeline for engine lifecycle transitions —
 * those are enqueued durably instead of fired inline (see outbox.ts) so a
 * crash after the state change can no longer lose the notification.
 *
 * Idempotency note (at-least-once): a re-delivery after a crash mid-fanout
 * may duplicate a chat message — acceptable for notifications; never route
 * money-mutating consumers through here.
 */
export async function deliverDomainEvent(payload: DomainEventPayload): Promise<void> {
  try {
    if (payload.projectId) {
      // 1. Broadcast in-app notifications and chat channel message
      await notifyProject({
        projectId: payload.projectId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        metadata: {
          ...payload.metadata,
          entityType: payload.entityType,
          entityId: payload.entityId,
        },
        postToChannel: payload.postToChannel ?? true,
        excludeUserId: payload.actorUserId,
      });

      // 2. Dispatch Web Push notifications to targeted role members
      const members = await db.projectMember.findMany({
        where: {
          projectId: payload.projectId,
          ...(payload.actorUserId ? { userId: { not: payload.actorUserId } } : {}),
          ...(payload.targetRoles && payload.targetRoles.length > 0
            ? { role: { in: payload.targetRoles } }
            : {}),
        },
        select: { userId: true },
      });

      for (const member of members) {
        await sendPushToUser(member.userId, {
          title: payload.title,
          body: payload.message,
          data: {
            url: `/projects/${payload.projectId}`,
            entityType: payload.entityType,
            entityId: payload.entityId,
          },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("[domain-events] Failed to dispatch event:", payload.type, err);
  }
}

/**
 * Emit a Domain Event in the background after the response is sent.
 */
export function emitDomainEvent(payload: DomainEventPayload): void {
  const executeEvent = async () => deliverDomainEvent(payload);

  try {
    after(executeEvent);
  } catch {
    // If outside a request lifecycle (e.g. background job / unit test), execute as floating promise
    executeEvent().catch(() => {});
  }
}
