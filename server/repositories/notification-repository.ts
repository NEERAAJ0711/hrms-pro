import { db } from "../db";
import { notifications } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import type { INotificationStorage } from "../storage-interfaces";

// NotificationRepository — DB access for the Notification domain.
// These notification queries previously lived inline in the route handlers and
// accessed `db` directly; they are moved here verbatim with behavior unchanged.
export class NotificationRepository implements INotificationStorage {
  async listForUser(userId: string) {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async listUnreadForUser(userId: string) {
    return await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }

  async markRead(id: string, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }

  async clearForUser(userId: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, userId));
  }
}
