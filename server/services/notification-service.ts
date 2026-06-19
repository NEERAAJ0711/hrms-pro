import { NotificationRepository } from "../repositories/notification-repository";

// NotificationService — business layer for user notifications (Task #5 Phase C).
// Wraps NotificationRepository so route handlers depend on a service seam rather
// than reaching into Drizzle/`db` directly. Behavior is identical to the former
// inline handler logic.
export class NotificationService {
  constructor(private repo = new NotificationRepository()) {}

  listForUser(userId: string) {
    return this.repo.listForUser(userId);
  }

  async unreadCount(userId: string): Promise<number> {
    const rows = await this.repo.listUnreadForUser(userId);
    return rows.length;
  }

  markRead(id: string, userId: string) {
    return this.repo.markRead(id, userId);
  }

  markAllRead(userId: string) {
    return this.repo.markAllRead(userId);
  }

  clearForUser(userId: string) {
    return this.repo.clearForUser(userId);
  }
}

export const notificationService = new NotificationService();
