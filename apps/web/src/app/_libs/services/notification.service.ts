import type {
  NotificationDto,
  NotificationListResponseDto,
  NotificationReadResponseDto,
} from "@innopeak/client-sdk";

import { notificationsApi } from "@/app/_libs/api-sdk/notifications-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { Notification, NotificationType } from "@/types/domain";

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
 * The backend's `description`/`reviewId` are `string | null` (a real column that may hold
 * nothing); the frontend's `Notification` predates the real API and models the same absence as
 * `""` / `undefined`. Narrowing here, once, is simpler than widening the type everywhere it's
 * rendered.
 */
function toNotification(dto: NotificationDto): Notification {
  return {
    id: dto.id,
    type: dto.type as NotificationType,
    title: dto.title,
    description: dto.description ?? "",
    createdAt: dto.createdAt,
    isRead: dto.isRead,
    ...(dto.reviewId != null && { reviewId: dto.reviewId }),
  };
}

/**
 * Notification service, against the real `/v1/notifications` routes throughout — the feed
 * (`list`) plus both read writes. Hooks and components only ever call `useNotifications`, never
 * this class directly.
 *
 * Both writes answer with the caller's unread total *after* the write, which is the one thing the
 * client cannot work out for itself (the feed it holds is only the pages it has fetched). The
 * hook reconciles its badge from that rather than decrementing a local guess.
 */
export class NotificationService {
  static async list(offset: number, limit: number): Promise<NotificationPage> {
    const response = await notificationsApi.notificationsControllerListV1({ offset, limit });
    const data = unwrap<NotificationListResponseDto>(response.data);
    return {
      items: data.items.map(toNotification),
      hasMore: data.hasMore,
      unreadTotal: data.unreadTotal,
    };
  }

  /** Idempotent by contract — re-marking an already-read row succeeds and keeps its original
   *  timestamp, which is what lets the panel fire this on every click. */
  static async markAsRead(id: string): Promise<number> {
    const response = await notificationsApi.notificationsControllerMarkReadV1({
      notificationId: id,
    });
    return unwrap<NotificationReadResponseDto>(response.data).unreadTotal;
  }

  /** Marks the caller's entire unread set, including rows this client has never fetched. */
  static async markAllAsRead(): Promise<number> {
    const response = await notificationsApi.notificationsControllerMarkAllReadV1();
    return unwrap<NotificationReadResponseDto>(response.data).unreadTotal;
  }
}
