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
  hasMore: boolean;
  /** Across the whole feed, not just this page, so the bell's dot is right even when unread rows sit past page one. */
  unreadTotal: number;
}

// Backend `description`/`reviewId` are `string | null`; the frontend `Notification` models absence as `""`/`undefined`, narrowed once here.
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

/** Both writes answer with the unread total after the write, which the client cannot derive from its partial pages. */
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

  /** Idempotent by contract: re-marking a read row succeeds and keeps its timestamp, so the panel can fire this on every click. */
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
