import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { NotificationService } from "@/app/_libs/services/notification.service";
import type { Notification } from "@/types/domain";

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

/**
 * Loads notifications once, then owns read/unread state locally — marking
 * read is optimistic and silent (no toast, no reload), matching how
 * frequent/low-stakes it is compared to the app's other mutations. Only the
 * initial load failure surfaces via toast.
 */
export function useNotifications(): UseNotificationsResult {
  const t = useTranslations("appShell.notificationPanel.toasts");
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    NotificationService.list()
      .then((result) => {
        if (!cancelled) setNotifications(result);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const markAsRead = React.useCallback((id: string) => {
    setNotifications((current) =>
      current.map((notification) => (notification.id === id ? { ...notification, isRead: true } : notification)),
    );
    void NotificationService.markAsRead(id);
  }, []);

  const markAllAsRead = React.useCallback(() => {
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
    void NotificationService.markAllAsRead();
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead };
}
