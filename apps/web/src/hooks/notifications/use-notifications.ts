import { useCallback, useEffect, useRef, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { NotificationService } from "@/app/_libs/services/notification.service";
import type { Notification } from "@/types/domain";

const PAGE_SIZE = 3;

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  /** Whether another `fetchNextPage()` would return more items. */
  hasMore: boolean;
  isFetchingNextPage: boolean;
  /** Set when a *paging* request failed, so the panel can offer a retry inline instead of toasting. */
  nextPageFailed: boolean;
  fetchNextPage: () => void;
  retryNextPage: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

/**
 * Loads notifications a page at a time (the panel calls `fetchNextPage` as the list nears its
 * bottom, and again whenever a page doesn't fill the container) and owns read/unread state
 * locally — marking read is optimistic and silent (no toast, no reload), matching how
 * frequent/low-stakes it is compared to the app's other mutations.
 *
 * `unreadCount` comes from the server's whole-feed total rather than the loaded rows: the bell's
 * dot speaks for every notification, not just the first page. Marking read adjusts it locally so
 * it stays honest between fetches.
 *
 * Only the *initial* load failure toasts. A failed paging request sets `nextPageFailed` instead —
 * toasting there fired once per scroll attempt and stacked up while the user kept scrolling.
 */
export function useNotifications(): UseNotificationsResult {
  const t = useTranslations("appShell.notificationPanel.toasts");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [nextPageFailed, setNextPageFailed] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [unreadTotal, setUnreadTotal] = useState(0);
  // Mirrors `notifications.length` synchronously for the offset — state updates aren't visible
  // within the same tick, and a fast double-trigger must not request the same offset twice.
  const offsetRef = useRef(0);
  const isFetchingRef = useRef(false);
  // Guards the initial load against React StrictMode's dev-only double-invoke of mount effects —
  // without it, the second invocation re-fires the same offset-0 request and its results get
  // appended on top of the first's, duplicating every row in the list.
  const initialLoadStarted = useRef(false);

  const fetchPage = useCallback(
    (offset: number, isInitial: boolean) => {
      isFetchingRef.current = true;
      if (isInitial) setIsLoading(true);
      else setIsFetchingNextPage(true);

      NotificationService.list(offset, PAGE_SIZE)
        .then((result) => {
          setNotifications((current) => [...current, ...result.items]);
          offsetRef.current = offset + result.items.length;
          setHasMore(result.hasMore);
          setUnreadTotal(result.unreadTotal);
          setNextPageFailed(false);
        })
        .catch(() => {
          if (isInitial) toast.error(t("loadFailed"));
          else setNextPageFailed(true);
        })
        .finally(() => {
          isFetchingRef.current = false;
          if (isInitial) setIsLoading(false);
          else setIsFetchingNextPage(false);
        });
    },
    [t],
  );

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    fetchPage(0, true);
    // Runs once on mount — `fetchPage` closes over `t`, not over any state this effect should
    // re-run for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNextPage = useCallback(() => {
    if (isFetchingRef.current || !hasMore || nextPageFailed) return;
    fetchPage(offsetRef.current, false);
  }, [hasMore, nextPageFailed, fetchPage]);

  /** The explicit retry behind `nextPageFailed` — scrolling alone must not re-fire a failing request. */
  const retryNextPage = useCallback(() => {
    if (isFetchingRef.current || !hasMore) return;
    setNextPageFailed(false);
    fetchPage(offsetRef.current, false);
  }, [hasMore, fetchPage]);

  // `notifications` is read directly rather than inside a `setNotifications` updater: nudging the
  // unread total from inside one would double-count under StrictMode, which invokes updaters twice.
  const markAsRead = useCallback(
    (id: string) => {
      const target = notifications.find((notification) => notification.id === id);
      if (target === undefined || target.isRead) return;

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id ? { ...notification, isRead: true } : notification,
        ),
      );
      setUnreadTotal((count) => Math.max(0, count - 1));
      void NotificationService.markAsRead(id);
    },
    [notifications],
  );

  const markAllAsRead = useCallback(() => {
    // Marks the whole feed server-side, so the total goes to zero rather than dropping by however
    // many rows happen to be loaded.
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, isRead: true })),
    );
    setUnreadTotal(0);
    void NotificationService.markAllAsRead();
  }, []);

  return {
    notifications,
    unreadCount: unreadTotal,
    isLoading,
    hasMore,
    isFetchingNextPage,
    nextPageFailed,
    fetchNextPage,
    retryNextPage,
    markAsRead,
    markAllAsRead,
  };
}
