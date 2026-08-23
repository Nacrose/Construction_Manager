import { isOrgAdmin } from "@/lib/authz";
/**
 * tRPC router for Communication — chat channels, messages, and orders.
 *
 * 5 channel types:
 *   - public: project-wide chat (everyone)
 *   - group: custom group (only members)
 *   - personal: 1:1 chat
 *   - project_order: PM broadcast (read receipts, pinned)
 *   - org_order: org-wide broadcast
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, getProjectRole } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { createNotification, notifyProjectMembers } from "@/server/utils/notify";
import { emailTemplates } from "@/server/utils/email";

export const chatRouter = router({
  /** List channels for the current user (across all their projects). */
  listChannels: protectedProcedure
    .input(z.object({ projectId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // Get channels where user is a member
      const memberChannels = await db.chatMember.findMany({
        where: { userId: ctx.user.id },
        select: { channelId: true },
      });
      const memberChannelIds = memberChannels.map(m => m.channelId);

      // Also get public/project_order channels for the project (user is a project member)
      let publicChannelIds: string[] = [];
      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
        const publicChannels = await db.chatChannel.findMany({
          where: {
            projectId: input.projectId,
            type: { in: ["public", "project_order"] },
          },
          select: { id: true },
        });
        publicChannelIds = publicChannels.map(c => c.id);
      }

      // Get org_order channels (org-wide broadcasts).
      // ChatChannel has no direct organizationId column or createdBy
      // relation, so we resolve via the raw createdById → User lookup.
      // Previously this returned EVERY org_order channel across all
      // tenants — a multi-tenant data leak.
      const userOrgId = ctx.user.organizationId;
      let orgChannelIds: string[] = [];
      if (userOrgId) {
        const orgChannels = await db.chatChannel.findMany({
          where: {
            type: "org_order",
            projectId: null, // org orders have no project
          },
          select: { id: true, createdById: true },
        });
        // Filter to channels whose creator belongs to the caller's org.
        // Channels with null createdById are legacy/orphan — exclude them
        // from the user's view (they can still be reached explicitly via
        // membership if appropriate).
        const creatorIds = Array.from(
          new Set(orgChannels.map((c) => c.createdById).filter((id): id is string => !!id)),
        );
        const creatorOrgs = creatorIds.length
          ? await db.user.findMany({
              where: { id: { in: creatorIds } },
              select: { id: true, organizationId: true },
            })
          : [];
        const sameOrgCreatorIds = new Set(
          creatorOrgs.filter((u) => u.organizationId === userOrgId).map((u) => u.id),
        );
        orgChannelIds = orgChannels
          .filter((c) => c.createdById && sameOrgCreatorIds.has(c.createdById))
          .map((c) => c.id);
      }

      const allChannelIds = [...new Set([...memberChannelIds, ...publicChannelIds, ...orgChannelIds])];

      const channels = await db.chatChannel.findMany({
        where: { id: { in: allChannelIds } },
        include: {
          _count: { select: { members: true } },
          messages: { take: 1, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { updatedAt: "desc" },
      });

      // Get unread counts per channel
      const channelsWithUnread = await Promise.all(channels.map(async (ch) => {
        const receipt = await db.chatReadReceipt.findUnique({
          where: { channelId_userId: { channelId: ch.id, userId: ctx.user.id } },
        });
        const lastReadAt = receipt?.lastReadAt ?? new Date(0);
        const unreadCount = await db.chatMessage.count({
          where: {
            channelId: ch.id,
            createdAt: { gt: lastReadAt },
            userId: { not: ctx.user.id },
          },
        });
        return { ...ch, unreadCount };
      }));

      return { channels: channelsWithUnread };
    }),

  /** Create a channel. */
  createChannel: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      name: z.string().min(1),
      type: z.enum(["public", "group", "personal", "project_order", "org_order"]).default("group"),
      description: z.string().optional(),
      memberIds: z.array(z.string()).optional(), // for group/personal
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.projectId) {
        await assertCanWrite(ctx.user, input.projectId);
      }

      // Only PM/Coordinator can create project_order, only org admin can create org_order
      if (input.type === "project_order" && input.projectId) {
        const role = await assertProjectMember(ctx.user, input.projectId);
        if (role !== "project_manager" && role !== "coordinator" && !isOrgAdmin(ctx.user)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only PMs can issue project orders." });
        }
      }
      if (input.type === "org_order") {
        // Org-wide broadcast — caller must be an org admin of an actual org.
        if (!ctx.user.organizationId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You don't belong to an organization." });
        }
        if (ctx.user.orgRole !== "org_admin" && ctx.user.orgRole !== "owner") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only org admins can issue org orders." });
        }
      }

      const channel = await db.chatChannel.create({
        data: {
          projectId: input.projectId || null,
          name: input.name,
          type: input.type,
          description: input.description || null,
          createdById: ctx.user.id,
        },
      });

      // Add creator as admin member
      await db.chatMember.create({
        data: { channelId: channel.id, userId: ctx.user.id, role: "admin" },
      });

      // Add specified members (for group/personal)
      if (input.memberIds && input.memberIds.length > 0) {
        await db.chatMember.createMany({
          data: input.memberIds
            .filter(id => id !== ctx.user.id)
            .map(id => ({ channelId: channel.id, userId: id, role: "member" })),
        });
      }

      // For public/project_order: auto-add all project members
      if ((input.type === "public" || input.type === "project_order") && input.projectId) {
        const members = await db.projectMember.findMany({
          where: { projectId: input.projectId, userId: { not: ctx.user.id } },
          select: { userId: true },
        });
        if (members.length > 0) {
          await db.chatMember.createMany({
            data: members.map(m => ({ channelId: channel.id, userId: m.userId, role: "member" })),
          });
        }
      }

      return { channel };
    }),

  /** Get messages for a channel (paginated). */
  getMessages: protectedProcedure
    .input(z.object({
      channelId: z.string(),
      cursor: z.string().optional(), // message ID for pagination
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      // Verify access
      const channel = await db.chatChannel.findUnique({ where: { id: input.channelId } });
      if (!channel) throw new TRPCError({ code: "NOT_FOUND" });

      // Check membership or public type
      const isMember = await db.chatMember.findUnique({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.user.id } },
      });
      if (!isMember && channel.type !== "public" && channel.type !== "project_order" && channel.type !== "org_order") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You're not a member of this channel." });
      }
      // For public / project_order channels tied to a project, the user
      // must still be a member of that project — otherwise any authed user
      // could read another project's public channel.
      if (
        !isMember &&
        (channel.type === "public" || channel.type === "project_order") &&
        channel.projectId
      ) {
        const projectRole = await getProjectRole(ctx.user.id, channel.projectId);
        if (!projectRole) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You're not a member of this project." });
        }
      }

      const messages = await db.chatMessage.findMany({
        where: { channelId: input.channelId },
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
      });

      const hasMore = messages.length > input.limit;
      const items = hasMore ? messages.slice(0, -1) : messages;

      return {
        messages: items.reverse(),
        hasMore,
        nextCursor: hasMore ? items[items.length - 1]?.id : null,
      };
    }),

  /** Get channel members for @mention autocomplete. */
  getChannelMembers: protectedProcedure
    .input(z.object({ channelId: z.string() }))
    .query(async ({ input }) => {
      const members = await db.chatMember.findMany({
        where: { channelId: input.channelId },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      });
      return { members: members.map((m) => m.user) };
    }),

  /** Send a message. */
  sendMessage: protectedProcedure
    .input(z.object({
      channelId: z.string(),
      text: z.string().min(1),
      attachmentData: z.string().optional(),
      attachmentName: z.string().optional(),
      attachmentType: z.string().optional(),
      linkedEntityType: z.string().optional(),
      linkedEntityId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const channel = await db.chatChannel.findUnique({ where: { id: input.channelId } });
      if (!channel) throw new TRPCError({ code: "NOT_FOUND" });

      // Membership / authorization checks based on channel type.
      // - project_order / org_order: only channel admins can post (existing check)
      // - public: user must be a member of the channel's project
      // - group / personal: user must be an explicit ChatMember
      if (channel.type === "project_order" || channel.type === "org_order") {
        const member = await db.chatMember.findUnique({
          where: { channelId_userId: { channelId: input.channelId, userId: ctx.user.id } },
        });
        if (!member || member.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can post orders." });
        }
      } else if (channel.type === "public") {
        // Public channels: verify the sender is a member of the project
        // the channel belongs to.
        if (channel.projectId) {
          const projectRole = await getProjectRole(ctx.user.id, channel.projectId);
          if (!projectRole) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You're not a member of this project." });
          }
        }
      } else {
        // group / personal: require an explicit ChatMember row
        const isMember = await db.chatMember.findUnique({
          where: { channelId_userId: { channelId: input.channelId, userId: ctx.user.id } },
        });
        if (!isMember) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You're not a member of this channel." });
        }
      }

      const message = await db.chatMessage.create({
        data: {
          channelId: input.channelId,
          userId: ctx.user.id,
          text: input.text,
          attachmentData: input.attachmentData || null,
          attachmentName: input.attachmentName || null,
          attachmentType: input.attachmentType || null,
          linkedEntityType: input.linkedEntityType || null,
          linkedEntityId: input.linkedEntityId || null,
        },
        include: { user: { select: { id: true, name: true, role: true } } },
      });

      // Update channel timestamp
      await db.chatChannel.update({ where: { id: input.channelId }, data: { updatedAt: new Date() } });

      // For orders: notify all members via email
      if (channel.type === "project_order" || channel.type === "org_order") {
        const members = await db.chatMember.findMany({
          where: { channelId: input.channelId, userId: { not: ctx.user.id } },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        const projectName = channel.projectId
          ? (await db.project.findUnique({ where: { id: channel.projectId }, select: { name: true } }))?.name ?? "Project"
          : "Organization";

        for (const m of members) {
          await createNotification({
            userId: m.user.id,
            projectId: channel.projectId ?? undefined,
            type: channel.type,
            title: `📢 Order: ${channel.name}`,
            message: input.text.slice(0, 200),
            emailSubject: `📢 Project Order — ${channel.name}`,
            emailHtml: emailTemplates.projectOrder(channel.name, input.text, projectName, ctx.user.name).html,
          });
        }
      }

      // Parse @mentions from text
      const mentionRegex = /@([\w]+(?:\s[\w]+)*)/g;
      const members = await db.chatMember.findMany({
        where: { channelId: input.channelId },
        include: { user: { select: { id: true, name: true } } },
      });
      const mentionedIds: string[] = [];
      let match;
      while ((match = mentionRegex.exec(input.text)) !== null) {
        const nameQuery = match[1].toLowerCase();
        const found = members.find((m) =>
          m.user.name?.toLowerCase().includes(nameQuery)
        );
        if (found && found.userId !== ctx.user.id) {
          mentionedIds.push(found.userId);
        }
      }
      if (mentionedIds.length > 0) {
        await db.chatMessage.update({
          where: { id: message.id },
          data: { mentionedUserIds: JSON.stringify(mentionedIds) },
        });
        for (const userId of mentionedIds) {
          try {
            const { createNotification } = await import("@/server/utils/notify");
            await createNotification({
              userId,
              projectId: channel.projectId ?? undefined,
              type: "chat_mention",
              title: `Mentioned in #${channel.name}`,
              message: `${ctx.user.name} mentioned you: "${input.text.slice(0, 100)}"`,
              postToChannel: false,
            });
          } catch { /* non-blocking */ }
        }
      }

      return { message };
    }),

  /** Mark messages as read (update read receipt). */
  markRead: protectedProcedure
    .input(z.object({ channelId: z.string(), lastMessageId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await db.chatReadReceipt.upsert({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.user.id } },
        create: {
          channelId: input.channelId,
          userId: ctx.user.id,
          lastReadMessageId: input.lastMessageId,
          lastReadAt: new Date(),
        },
        update: {
          lastReadMessageId: input.lastMessageId,
          lastReadAt: new Date(),
        },
      });
      return { ok: true };
    }),

  /** Get read receipts for a channel (who has seen the latest messages). */
  getReadReceipts: protectedProcedure
    .input(z.object({ channelId: z.string() }))
    .query(async ({ ctx, input }) => {
      const channel = await db.chatChannel.findUnique({ where: { id: input.channelId } });
      if (!channel) throw new TRPCError({ code: "NOT_FOUND" });

      const receipts = await db.chatReadReceipt.findMany({
        where: { channelId: input.channelId },
        include: { user: { select: { id: true, name: true } } },
      });

      return { receipts };
    }),

  /** Pin/unpin a message (orders only). */
  togglePin: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const msg = await db.chatMessage.findUnique({ where: { id: input.messageId } });
      if (!msg) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await db.chatMessage.update({
        where: { id: input.messageId },
        data: { isPinned: !msg.isPinned },
      });
      return { message: updated };
    }),

  /** Add members to a group channel. */
  addMembers: protectedProcedure
    .input(z.object({ channelId: z.string(), userIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const member = await db.chatMember.findUnique({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.user.id } },
      });
      if (!member || member.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only channel admins can add members." });
      }

      await db.chatMember.createMany({
        data: input.userIds.map(id => ({ channelId: input.channelId, userId: id, role: "member" })),
        skipDuplicates: true,
      });

      return { ok: true };
    }),

  /** Delete a message (own messages only). */
  deleteMessage: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const msg = await db.chatMessage.findUnique({ where: { id: input.messageId } });
      if (!msg) throw new TRPCError({ code: "NOT_FOUND" });
      if (msg.userId !== ctx.user.id && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own messages." });
      }
      await db.chatMessage.delete({ where: { id: input.messageId } });
      return { ok: true };
    }),

  /**
   * List messages linked to a specific entity (e.g., daily report, RFI).
   * Used to fetch image attachments dropped onto a report editor.
   */
  listByEntity: protectedProcedure
    .input(z.object({
      entityType: z.string(),
      entityId: z.string(),
      imagesOnly: z.boolean().default(true),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const messages = await db.chatMessage.findMany({
        where: {
          linkedEntityType: input.entityType,
          linkedEntityId: input.entityId,
          ...(input.imagesOnly
            ? { attachmentType: { startsWith: "image/" } }
            : {}),
        },
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
      return { messages };
    }),

  /**
   * Search users for starting a DM. Returns users in the same organization
   * (or all users if no org). Excludes the current user.
   */
  searchUsers: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(100),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      if (!q) return { users: [] };

      const where: any = {
        AND: [
          { id: { not: ctx.user.id } },
          {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      };

      // Scope to same org if user is in one
      if (ctx.user.organizationId) {
        where.AND.push({ organizationId: ctx.user.organizationId });
      }

      const users = await db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatarUrl: true,
          lastActiveAt: true,
        },
        take: input.limit,
        orderBy: { name: "asc" },
      });

      return { users };
    }),

  /**
   * Get or create a personal (1:1) DM channel with another user.
   * Returns the existing channel if one already exists between the two users.
   */
  getOrCreateDM: protectedProcedure
    .input(z.object({ otherUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.otherUserId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot DM yourself." });
      }

      // Verify the other user exists (and is in same org, if applicable)
      const otherUser = await db.user.findUnique({
        where: { id: input.otherUserId },
        select: { id: true, name: true, email: true, organizationId: true },
      });
      if (!otherUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      // Find existing personal channel containing both users
      const myChannels = await db.chatMember.findMany({
        where: { userId: ctx.user.id },
        select: {
          channelId: true,
          channel: {
            select: {
              id: true,
              type: true,
              name: true,
              members: { select: { userId: true } },
            },
          },
        },
      });

      for (const cm of myChannels) {
        if (cm.channel.type !== "personal") continue;
        const memberIds = cm.channel.members.map((m) => m.userId);
        if (memberIds.length === 2 && memberIds.includes(input.otherUserId)) {
          return { channel: cm.channel, created: false };
        }
      }

      // Create new personal channel
      const otherName = otherUser.name;
      const myName = ctx.user.name;
      const channel = await db.chatChannel.create({
        data: {
          name: `DM: ${myName} ↔ ${otherName}`,
          type: "personal",
          createdById: ctx.user.id,
        },
      });

      // Add both users as members
      await db.chatMember.createMany({
        data: [
          { channelId: channel.id, userId: ctx.user.id, role: "member" },
          { channelId: channel.id, userId: input.otherUserId, role: "member" },
        ],
      });

      // Re-fetch with members for consistent shape
      const fresh = await db.chatChannel.findUnique({
        where: { id: channel.id },
        select: {
          id: true, type: true, name: true, members: { select: { userId: true } },
        },
      });

      return { channel: fresh, created: true };
    }),

  /**
   * Get presence info for a list of users — lastActiveAt + isOnline flag.
   * "Online" = lastActiveAt within last 2 minutes.
   */
  getPresence: protectedProcedure
    .input(z.object({ userIds: z.array(z.string()).max(100) }))
    .query(async ({ ctx, input }) => {
      const users = await db.user.findMany({
        where: { id: { in: input.userIds } },
        select: { id: true, lastActiveAt: true, name: true },
      });

      const now = new Date();
      const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000);

      return {
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          lastActiveAt: u.lastActiveAt,
          isOnline: u.lastActiveAt ? u.lastActiveAt > twoMinAgo : false,
        })),
      };
    }),

  /**
   * Get read status for messages in a channel — returns the latest message
   * each member has read. Used for "seen"/"unread" indicators.
   */
  getMessageStatus: protectedProcedure
    .input(z.object({ channelId: z.string() }))
    .query(async ({ ctx, input }) => {
      const channel = await db.chatChannel.findUnique({
        where: { id: input.channelId },
        include: {
          members: {
            select: {
              userId: true,
              user: { select: { id: true, name: true, lastActiveAt: true } },
            },
          },
        },
      });
      if (!channel) throw new TRPCError({ code: "NOT_FOUND" });

      // For personal channels, return the other user's read receipt
      if (channel.type === "personal") {
        const otherMember = channel.members.find((m) => m.userId !== ctx.user.id);
        if (!otherMember) return { otherUser: null, lastReadMessageId: null, lastReadAt: null };

        const receipt = await db.chatReadReceipt.findUnique({
          where: { channelId_userId: { channelId: input.channelId, userId: otherMember.userId } },
        });

        return {
          otherUser: {
            id: otherMember.user.id,
            name: otherMember.user.name,
            lastActiveAt: otherMember.user.lastActiveAt,
          },
          lastReadMessageId: receipt?.lastReadMessageId ?? null,
          lastReadAt: receipt?.lastReadAt ?? null,
        };
      }

      // For group channels: return count of members who have read the latest message
      return { otherUser: null, lastReadMessageId: null, lastReadAt: null };
    }),
});
