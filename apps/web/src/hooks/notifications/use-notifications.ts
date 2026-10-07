
import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { type NotificationPage, NotificationService } from "@/app/_libs/services/notification.service";
import type { Notification } from "@/types/domain";

const PAGE_SIZE = 3;

export const notificationsQueryKey = ["notifications"] as const;

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  /** Set when a *paging* request failed, so the panel can offer a retry inline instead of toasting. */
  nextPageFailed: boolean;
  fetchNextPage: () => void;
  retryNextPage: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

type NotificationsData = InfiniteData<NotificationPage, number>;

/**
 * Marking read is optimistic and silent (frequent, low-stakes). `unreadCount` is the server's
 * whole-feed total from the latest page, not the loaded rows: the bell's dot covers every
 * notification. Only the initial load failure toasts (`isLoadingError`); a paging failure surfaces
 * as `isFetchNextPageError`, since toasting there fired per scroll attempt and stacked up.
 */
export function useNotifications(): UseNotificationsResult {
  const t = useTranslations("appShell.notificationPanel.toasts");
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: notificationsQueryKey,
    queryFn: ({ pageParam }) => NotificationService.list(pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.reduce((sum, page) => sum + page.items.length, 0) : undefined,
  });

  useEffect(() => {
    if (query.isLoadingError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isLoadingError]);

  // A synchronous lock: react-query's fetching flag only updates through a re-render, so two
  // `fetchNextPage` calls in the same tick would both fire.
  const isFetchingNextPageRef = useRef(false);

  const fetchNextPage = useCallback(() => {
    // Scrolling alone must not re-fire a failing request; `retryNextPage` is the explicit way past
    // it.
    if (query.isFetchNextPageError || isFetchingNextPageRef.current) return;
    isFetchingNextPageRef.current = true;
    void query.fetchNextPage().finally(() => {
      isFetchingNextPageRef.current = false;
    });
  }, [query]);

  const retryNextPage = useCallback(() => {
    void query.fetchNextPage();
  }, [query]);

  /**
   * Replaces the optimistic unread guess with the server's count, which lives on every page's
   * response. Only the server knows it: the badge covers the whole feed while the client holds only
   * fetched pages.
   */
  const applyUnreadTotal = useCallback(
    (unreadTotal: number) => {
      queryClient.setQueryData<NotificationsData>(notificationsQueryKey, (old) =>
        old ? { ...old, pages: old.pages.map((page) => ({ ...page, unreadTotal })) } : old,
      );
    },
    [queryClient],
  );

  /**
   * A failed write leaves an optimistic value the server never accepted. Refetching repairs it
   * without clobbering a concurrent write that succeeded, as restoring a snapshot could.
   */
  const resyncAfterFailedWrite = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
  }, [queryClient]);

  const markAsRead = useCallback(
    (id: string) => {
      queryClient.setQueryData<NotificationsData>(notificationsQueryKey, (old) => {
        if (!old) return old;

        const target = old.pages.flatMap((page) => page.items).find((item) => item.id === id);
        if (target === undefined || target.isRead) return old;

        const pages = old.pages.map((page, index) => ({
          ...page,
          items: page.items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
          // Nudge only the most recent page's total (the one `unreadCount` reads); the server's
          // count replaces it when the request lands.
          unreadTotal:
            index === old.pages.length - 1 ? Math.max(0, page.unreadTotal - 1) : page.unreadTotal,
        }));

        return { ...old, pages };
      });

      void NotificationService.markAsRead(id).then(applyUnreadTotal, resyncAfterFailedWrite);
    },
    [queryClient, applyUnreadTotal, resyncAfterFailedWrite],
  );

  const markAllAsRead = useCallback(() => {
    // Marks the whole feed server-side, including unfetched rows, so the total goes to zero.
    queryClient.setQueryData<NotificationsData>(notificationsQueryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => ({ ...item, isRead: true })),
          unreadTotal: 0,
        })),
      };
    });

    void NotificationService.markAllAsRead().then(applyUnreadTotal, resyncAfterFailedWrite);
  }, [queryClient, applyUnreadTotal, resyncAfterFailedWrite]);

  const pages = query.data?.pages ?? [];
  const lastPage = pages[pages.length - 1];

  return {
    notifications: pages.flatMap((page) => page.items),
    unreadCount: lastPage?.unreadTotal ?? 0,
    isLoading: query.isLoading,
    hasMore: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    nextPageFailed: query.isFetchNextPageError,
    fetchNextPage,
    retryNextPage,
    markAsRead,
    markAllAsRead,
  };
}
