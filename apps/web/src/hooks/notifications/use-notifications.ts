
import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { type NotificationPage, NotificationService } from "@/app/_libs/services/notification.service";
import { useNotificationStream } from "@/hooks/notifications/use-notification-stream";
import type { Notification } from "@/types/domain";

const PAGE_SIZE = 3;

/** How often a visible page asks the server whether anything new arrived. Pauses in a hidden tab and checks again the moment it is shown. */
export const NOTIFICATIONS_POLL_MS = 45_000;
/** While a stream is up, a push tells us about new notices, so polling only backs it up in case a message was missed. */
export const NOTIFICATIONS_POLL_WITH_STREAM_MS = 3 * 60_000;
/** A feed fetched this recently is current enough that a stream's first `ready` needs no catch-up refetch. */
const FEED_FRESH_MS = 5_000;
/** An interval tick that lands this close before a check is due still runs it, so timer jitter does not push a check a whole tick later. */
const TICK_SLACK_MS = 1_000;
/** A focus event right after a visibility change (or a repeat focus) is not worth a second request. */
const MIN_CHECK_GAP_MS = 10_000;

export const notificationsQueryKey = ["notifications"] as const;

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  isLoaded: boolean;
  isResyncing: boolean;
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
  const [isResyncing, setIsResyncing] = useState(false);

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
    // The repair moves the unread count back up, which is a correction and not news: the bell stays quiet until it lands.
    setIsResyncing(true);
    void queryClient
      .invalidateQueries({ queryKey: notificationsQueryKey })
      .finally(() => setIsResyncing(false));
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
  const unreadCount = lastPage?.unreadTotal ?? 0;

  // A ref, not a dependency: the check below must read the latest count without restarting the interval each time it changes.
  const unreadCountRef = useRef(unreadCount);
  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  /**
   * Polling, not push (yet): a one-row page is the cheapest way to read the server's whole-feed `unreadTotal`. Only when that is higher
   * than what the feed shows is the feed itself refetched, so an idle tab costs one tiny request per interval. Starts after the first
   * load (no extra request at mount) and never runs in a hidden tab; showing the tab or focusing the window checks straight away.
   */
  const isLoading = query.isLoading;

  // Push first, polling as the backstop: `onNotice` just refetches the feed, so the unread count rises and the bell reacts exactly as it
  // does when a poll finds something new.
  const { connected: streamConnected } = useNotificationStream({
    enabled: !isLoading,
    onNotice: () => void queryClient.invalidateQueries({ queryKey: notificationsQueryKey }),
    // A first connection right after the feed loaded needs no catch-up; any other (a reconnect, a tab taking over) does.
    isFeedFresh: () =>
      Date.now() - (queryClient.getQueryState(notificationsQueryKey)?.dataUpdatedAt ?? 0) <
      FEED_FRESH_MS,
  });

  // A ref, not a dependency of the effect below: a stream that flaps would otherwise tear the interval down on every flip, restarting
  // its cadence and suppressing the focus checks, so the backstop could go quiet exactly when the stream is unreliable.
  const streamConnectedRef = useRef(streamConnected);
  useEffect(() => {
    streamConnectedRef.current = streamConnected;
  }, [streamConnected]);

  useEffect(() => {
    if (isLoading) return;

    let cancelled = false;
    let lastCheckAt = Date.now();

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      lastCheckAt = Date.now();
      try {
        const { unreadTotal } = await NotificationService.list(0, 1);
        if (!cancelled && unreadTotal > unreadCountRef.current) {
          void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
        }
      } catch {
        // Nothing to report: the next tick tries again, and a failed poll must not toast every 45 seconds.
      }
    };

    // A steady tick at the fast cadence; while a stream is up most ticks are skipped until the slow cadence is due.
    const tick = () => {
      const dueMs = streamConnectedRef.current
        ? NOTIFICATIONS_POLL_WITH_STREAM_MS
        : NOTIFICATIONS_POLL_MS;
      if (Date.now() - lastCheckAt >= dueMs - TICK_SLACK_MS) void check();
    };
    const intervalId = window.setInterval(tick, NOTIFICATIONS_POLL_MS);
    const checkIfDue = () => {
      if (Date.now() - lastCheckAt >= MIN_CHECK_GAP_MS) void check();
    };
    document.addEventListener("visibilitychange", checkIfDue);
    window.addEventListener("focus", checkIfDue);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkIfDue);
      window.removeEventListener("focus", checkIfDue);
    };
  }, [isLoading, queryClient]);

  return {
    notifications: pages.flatMap((page) => page.items),
    unreadCount,
    isLoading: query.isLoading,
    /** True once a load has succeeded: the unread count is only a baseline for the bell after that (a failed load reads as 0). */
    isLoaded: query.isSuccess,
    /** A failed write is being repaired, so the unread count is moving back to the server's value. */
    isResyncing,
    hasMore: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    nextPageFailed: query.isFetchNextPageError,
    fetchNextPage,
    retryNextPage,
    markAsRead,
    markAllAsRead,
  };
}
