
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

type NotificationsData = InfiniteData<NotificationPage, number>;

/**
 * Loads notifications a page at a time (the panel calls `fetchNextPage` as the list nears its
 * bottom, and again whenever a page doesn't fill the container) and owns read/unread state
 * through react-query's cache — marking read is optimistic and silent (no toast, no reload),
 * matching how frequent/low-stakes it is compared to the app's other mutations.
 *
 * `unreadCount` comes from the server's whole-feed total on the most recently fetched page,
 * rather than the loaded rows: the bell's dot speaks for every notification, not just the first
 * page. Marking read adjusts it in the cache so it stays honest between fetches.
 *
 * Only the *initial* load failure toasts (`isLoadingError` — failed with no page ever loaded). A
 * failed paging request surfaces as `isFetchNextPageError` instead — toasting there fired once
 * per scroll attempt and stacked up while the user kept scrolling. `useInfiniteQuery` itself
 * handles what a hand-rolled `offsetRef`/`isFetchingRef`/StrictMode-mount-guard used to: dedup of
 * concurrent identical requests and safe double-invocation under StrictMode need no extra code.
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

  // A synchronous lock, not just a check against `query.isFetchingNextPage`: react-query's own
  // "fetching" flag only updates through a re-render, so two calls to `fetchNextPage` in the same
  // synchronous tick (a fast double-scroll-trigger) would both see the old, pre-fetch value and
  // both fire. This ref is set/cleared within the same tick the call happens in, closing that gap.
  const isFetchingNextPageRef = useRef(false);

  const fetchNextPage = useCallback(() => {
    // Scrolling alone must not re-fire a failing request — matches the original's
    // `nextPageFailed` gate; `retryNextPage` is the explicit way past it.
    if (query.isFetchNextPageError || isFetchingNextPageRef.current) return;
    isFetchingNextPageRef.current = true;
    void query.fetchNextPage().finally(() => {
      isFetchingNextPageRef.current = false;
    });
  }, [query]);

  const retryNextPage = useCallback(() => {
    void query.fetchNextPage();
  }, [query]);

  const markAsRead = useCallback(
    (id: string) => {
      queryClient.setQueryData<NotificationsData>(notificationsQueryKey, (old) => {
        if (!old) return old;

        const target = old.pages.flatMap((page) => page.items).find((item) => item.id === id);
        if (target === undefined || target.isRead) return old;

        const pages = old.pages.map((page, index) => ({
          ...page,
          items: page.items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
          // The unread total lives on every page's response; nudge only the most recent one, the
          // one `unreadCount` below actually reads.
          unreadTotal:
            index === old.pages.length - 1 ? Math.max(0, page.unreadTotal - 1) : page.unreadTotal,
        }));

        return { ...old, pages };
      });
      void NotificationService.markAsRead(id);
    },
    [queryClient],
  );

  const markAllAsRead = useCallback(() => {
    // Marks the whole feed server-side, so the total goes to zero rather than dropping by however
    // many rows happen to be loaded.
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
    void NotificationService.markAllAsRead();
  }, [queryClient]);

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
