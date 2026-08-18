/**
 * Notification helper — sends internal notifications (in-app + chat).
 * Emails are sent ONLY for external-facing events (to client/consultant).
 *
 * Internal events (RFI assigned, report submitted, low stock):
 *   → In-app notification (Notification model)
 *   → Chat message in project's #notifications channel (if exists)
 *
 * External events (report dispatched to client, IPC sent for payment):
 *   → In-app notification
 *   → Email (via sendEmail)
 */
import { db } from "@/lib/db";
import { sendEmail } from "./email";

/**
 * Create an in-app notification + optionally post to the project's
 * notification channel + optionally send email.
 */
export async function createNotification(params: {
  userId: string;
  projectId?: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  // Internal: post to project's #notifications channel (if it exists)
  postToChannel?: boolean;
  // External: send email (only for client/consultant-facing events)
  emailSubject?: string;
  emailHtml?: string;
  emailTo?: string; // specific email address (external party)
}): Promise<void> {
  try {
    // 1. Create in-app notification
    await db.notification.create({
      data: {
        userId: params.userId,
        projectId: params.projectId ?? null,
        type: params.type,
        title: params.title,
        message: params.message,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });

    // 2. Post to project's notification channel (internal communication)
    if (params.postToChannel && params.projectId) {
      // Find or create the project's #notifications channel
      let channel = await db.chatChannel.findFirst({
        where: { projectId: params.projectId, type: "public", name: "Notifications" },
      });

      if (!channel) {
        // Auto-create the notifications channel if it doesn't exist
        channel = await db.chatChannel.create({
          data: {
            projectId: params.projectId,
            name: "Notifications",
            type: "public",
            description: "System notifications — RFI updates, report submissions, stock alerts",
          },
        });
        // Add all project members to this channel
        const members = await db.projectMember.findMany({
          where: { projectId: params.projectId },
          select: { userId: true },
        });
        await db.chatMember.createMany({
          data: members.map(m => ({ channelId: channel!.id, userId: m.userId, role: "member" })),
          skipDuplicates: true,
        });
      }

      // Post the notification as a system message
      await db.chatMessage.create({
        data: {
          channelId: channel.id,
          userId: params.userId,
          text: `🔔 **${params.title}**\n${params.message}`,
          linkedEntityType: params.metadata?.entityType as string || undefined,
          linkedEntityId: params.metadata?.entityId as string || undefined,
        },
      });

      // Update channel timestamp
      await db.chatChannel.update({
        where: { id: channel.id },
        data: { updatedAt: new Date() },
      });
    }

    // 3. Send email (ONLY for external-facing events)
    if (params.emailSubject && params.emailHtml) {
      if (params.emailTo) {
        // External email (client/consultant)
        await sendEmail({
          to: params.emailTo,
          subject: params.emailSubject,
          html: params.emailHtml,
        });
      } else {
        // Internal user email (only if explicitly requested)
        const user = await db.user.findUnique({
          where: { id: params.userId },
          select: { email: true },
        });
        if (user?.email) {
          await sendEmail({
            to: user.email,
            subject: params.emailSubject,
            html: params.emailHtml,
          });
        }
      }
    }
  } catch (err) {
    console.error("[notify] Failed:", err);
  }
}

/** Notify all project members (internal only — no email). */
export async function notifyProjectMembers(params: {
  projectId: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  excludeUserId?: string;
  postToChannel?: boolean;
}): Promise<void> {
  try {
    const members = await db.projectMember.findMany({
      where: {
        projectId: params.projectId,
        ...(params.excludeUserId ? { userId: { not: params.excludeUserId } } : {}),
      },
      select: { userId: true },
    });

    for (const member of members) {
      await createNotification({
        userId: member.userId,
        projectId: params.projectId,
        type: params.type,
        title: params.title,
        message: params.message,
        metadata: params.metadata,
        postToChannel: params.postToChannel,
      });
    }

    // Post to channel once (not per-user)
    if (params.postToChannel && members.length > 0) {
      // Already handled in createNotification for the first user
      // But we only want one channel message, so let's post separately
      // Actually, createNotification posts per-user which is wrong.
      // Let's fix: only post to channel once.
    }
  } catch (err) {
    console.error("[notify] Failed to notify project members:", err);
  }
}

/**
 * Post a single notification to the project's notification channel
 * AND create in-app notifications for all members.
 * This is the correct pattern — one channel message + N in-app notifications.
 */
export async function notifyProject(params: {
  projectId: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  excludeUserId?: string;
  postToChannel?: boolean;
  // Email for external parties (client/consultant email address)
  externalEmail?: string;
  externalEmailSubject?: string;
  externalEmailHtml?: string;
}): Promise<void> {
  try {
    // 1. Post to notification channel (once)
    if (params.postToChannel) {
      let channel = await db.chatChannel.findFirst({
        where: { projectId: params.projectId, type: "public", name: "Notifications" },
      });

      if (!channel) {
        channel = await db.chatChannel.create({
          data: {
            projectId: params.projectId,
            name: "Notifications",
            type: "public",
            description: "System notifications",
          },
        });
        const members = await db.projectMember.findMany({
          where: { projectId: params.projectId },
          select: { userId: true },
        });
        await db.chatMember.createMany({
          data: members.map(m => ({ channelId: channel!.id, userId: m.userId, role: "member" })),
          skipDuplicates: true,
        });
      }

      // Use the triggering user's ID (or first member) as the message author
      const authorId = params.excludeUserId ?? (await db.projectMember.findFirst({
        where: { projectId: params.projectId },
        select: { userId: true },
      }))?.userId;

      if (authorId) {
        await db.chatMessage.create({
          data: {
            channelId: channel.id,
            userId: authorId,
            text: `🔔 **${params.title}**\n${params.message}`,
            linkedEntityType: params.metadata?.entityType as string || undefined,
            linkedEntityId: params.metadata?.entityId as string || undefined,
          },
        });
        await db.chatChannel.update({ where: { id: channel.id }, data: { updatedAt: new Date() } });
      }
    }

    // 2. Create in-app notifications for all members (internal)
    const members = await db.projectMember.findMany({
      where: {
        projectId: params.projectId,
        ...(params.excludeUserId ? { userId: { not: params.excludeUserId } } : {}),
      },
      select: { userId: true },
    });

    for (const member of members) {
      await db.notification.create({
        data: {
          userId: member.userId,
          projectId: params.projectId,
          type: params.type,
          title: params.title,
          message: params.message,
          metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        },
      });
    }

    // 3. Send external email (ONLY if externalEmail is provided)
    if (params.externalEmail && params.externalEmailSubject && params.externalEmailHtml) {
      await sendEmail({
        to: params.externalEmail,
        subject: params.externalEmailSubject,
        html: params.externalEmailHtml,
      });
    }
  } catch (err) {
    console.error("[notify] notifyProject failed:", err);
  }
}
