import { MOCK_NOTIFICATIONS } from "@/app/_libs/mock-data/notifications";
import type { Notification } from "@/types/domain";

export interface NotificationPage {
  items: Notification[];
  /** Whether a further `list` call (with a larger `offset`) would return more items. */
  hasMore: boolean;
  /**
   * Unread across *every* notification, not just this page. The bell's dot has to reflect the
   * whole feed — deriving it from the loaded rows meant a user whose unread items sat past page
   * one saw no indicator at all until they scrolled the entire list.
   */
  unreadTotal: number;
}

/**
 * Notification service. Mock implementation — becomes a real backend call
 * (plus a live push channel) once that API exists, ideally cursor-paginated
 * (ordered by `createdAt`/id) rather than offset-based: a live-updating feed
 * makes an offset shift under the caller as new notifications arrive.
 * Hooks and components only ever call `useNotifications`, never this class directly.
 */
export class NotificationService {
  /** `offset`/`limit` page through the mock array — the shape the real endpoint's paging should preserve. */
  static async list(offset: number, limit: number): Promise<NotificationPage> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const items = structuredClone(MOCK_NOTIFICATIONS).slice(offset, offset + limit);
    return {
      items,
      hasMore: offset + limit < MOCK_NOTIFICATIONS.length,
      unreadTotal: MOCK_NOTIFICATIONS.filter((notification) => !notification.isRead).length,
    };
  }

  static async markAsRead(_id: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  static async markAllAsRead(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
