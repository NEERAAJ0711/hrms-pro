import { db } from "./db";
import { notifications } from "../shared/schema";
import { randomUUID } from "crypto";
import { pushToUser } from "./sse";

export interface NotificationPayload {
  userId: string;
  companyId?: string | null;
  type: string;
  title: string;
  message: string;
  link?: string;
}

export async function createNotification(payload: NotificationPayload): Promise<void> {
  try {
    const row = {
      id: randomUUID(),
      userId: payload.userId,
      companyId: payload.companyId || null,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link || null,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    await db.insert(notifications).values(row);
    pushToUser(payload.userId, { type: "notification", notification: row });
  } catch (err) {
    console.error("[Notification] Failed to create notification:", err);
  }
}

export async function createNotificationForMany(userIds: string[], payload: Omit<NotificationPayload, "userId">): Promise<void> {
  try {
    if (!userIds.length) return;
    const rows = userIds.map(userId => ({
      id: randomUUID(),
      userId,
      companyId: payload.companyId || null,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link || null,
      isRead: false,
      createdAt: new Date().toISOString(),
    }));
    await db.insert(notifications).values(rows);
    rows.forEach(row => pushToUser(row.userId, { type: "notification", notification: row }));
  } catch (err) {
    console.error("[Notification] Failed to create bulk notifications:", err);
  }
}
