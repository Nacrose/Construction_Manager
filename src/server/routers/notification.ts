/**
 * tRPC router for in-app notifications.
 * Auto-generates notifications for schedule delays, conflicts, revisions.
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export const notificationRouter = router({
  /** List notifications for the current user (unread first). */
  list: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const notifications = await db.notification.findMany({
        where: {
          userId: ctx.user.id,
          ...(input.unreadOnly ? { isRead: false } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return { notifications, unreadCount: notifications.filter(n => !n.isRead).length };
    }),

  /** Mark a notification as read. */
  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.notification.updateMany({
        where: { id: input.id, userId: ctx.user.id },
        data: { isRead: true },
      });
      return { ok: true };
    }),

  /** Mark all notifications as read. */
  markAllRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      await db.notification.updateMany({
        where: { userId: ctx.user.id, isRead: false },
        data: { isRead: true },
      });
      return { ok: true };
    }),
});
