
import type { Route } from "next";
import Link from "next/link";

import { useLocale, useTranslations } from "next-intl";
import { type ComponentType, type UIEvent, useEffect, useState } from "react";
import { LuBell, LuCheck, LuClock, LuTriangleAlert, LuWifiOff } from "react-icons/lu";


import { ROUTES } from "@/app/_libs/constants/routes";
import { cn } from "@/app/_libs/utils/cn";
import { formatRelativeTime } from "@/app/_libs/utils/relative-time";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/notifications/use-notifications";
import type { Notification, NotificationType } from "@/types/domain";

/** How close to the bottom edge counts as "time to load more". */
const NEAR_BOTTOM_PX = 80;

const TYPE_ICON: Record<NotificationType, ComponentType<{ className?: string }>> = {
  review_escalated: LuTriangleAlert,
  reply_needs_approval: LuClock,
  reply_approved: LuCheck,
  connection_issue: LuWifiOff,
};

const TYPE_ICON_CLASSNAME: Record<NotificationType, string> = {
  review_escalated: "bg-warning-soft text-warning",
  reply_needs_approval: "bg-accent text-primary",
  reply_approved: "bg-success-soft text-success",
  connection_issue: "bg-destructive-soft text-destructive",
};

interface NotificationRowProps {
  notification: Notification;
  onRead: (id: string) => void;
}

function NotificationRow({ notification, onRead }: NotificationRowProps) {
  const Icon = TYPE_ICON[notification.type];
  const locale = useLocale();

  const content = (
    <div
      className={cn(
        "ease-fluid hover:bg-accent flex items-start gap-3 rounded-md p-2.5 transition-colors",
        !notification.isRead && "bg-accent/50",
      )}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          TYPE_ICON_CLASSNAME[notification.type],
        )}>
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{notification.title}</p>
          {!notification.isRead ? (
            <span className="bg-primary size-1.5 shrink-0 rounded-full" />
          ) : null}
        </div>
        <p className="text-muted-foreground line-clamp-2 text-xs">{notification.description}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {formatRelativeTime(notification.createdAt, locale)}
        </p>
      </div>
    </div>
  );

  if (notification.reviewId) {
    return (
      <Link
        href={ROUTES.REVIEW_DETAIL(notification.reviewId) as Route}
        onClick={() => onRead(notification.id)}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => onRead(notification.id)} className="w-full text-left">
      {content}
    </button>
  );
}

export function NotificationPanel() {
  const t = useTranslations("appShell");
  const tPanel = useTranslations("appShell.notificationPanel");
  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    isFetchingNextPage,
    nextPageFailed,
    fetchNextPage,
    retryNextPage,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  // The scroll container is held in *state*, not a ref, and attached with a callback ref: Radix
  // mounts PopoverContent a commit after `open` flips, so an effect keyed on open-state ran while
  // the element did not exist yet and had nothing to re-trigger it. Storing the node re-renders at
  // the moment it actually attaches, which is when there is something to measure.
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);

  const isNearBottom = (el: HTMLDivElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (isNearBottom(event.currentTarget)) fetchNextPage();
  };

  /**
   * Tops the list up whenever the loaded rows don't actually overflow the container.
   *
   * A scroll handler alone was unreachable in exactly the common case: three short rows inside a
   * 320px box leave nothing to scroll, so no scroll event ever fired, `fetchNextPage` was never
   * called, and every notification past the first page was permanently unloadable behind a
   * spinner that never resolved. Re-runs as rows arrive and as the popover mounts, so it keeps
   * pulling pages until the list either overflows or runs out.
   *
   * `isLoading` is a dependency, not just a guard: the hook clears its in-flight latch in the same
   * tick it flips `isLoading` to false, and without that dependency this effect's one run landed
   * while the latch was still set, bailed, and had nothing left to wake it.
   */
  useEffect(() => {
    if (listEl === null || isLoading || !hasMore || isFetchingNextPage || nextPageFailed) return;
    if (isNearBottom(listEl)) fetchNextPage();
  }, [
    listEl,
    notifications.length,
    isLoading,
    hasMore,
    isFetchingNextPage,
    nextPageFailed,
    fetchNextPage,
  ]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("notifications")} className="relative">
          <LuBell className="size-4.5" />
          {unreadCount > 0 ? (
            <span className="bg-destructive absolute top-1.5 right-1.5 flex size-2 rounded-full" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-border flex items-center justify-between border-b px-3.5 py-3">
          <p className="text-sm font-semibold">{tPanel("title")}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0}
            onClick={markAllAsRead}
            className="h-auto px-1.5 py-1 text-xs font-medium">
            {tPanel("markAllRead")}
          </Button>
        </div>

        {notifications.length === 0 ? (
          <p className="text-muted-foreground px-3.5 py-6 text-center text-sm">{tPanel("empty")}</p>
        ) : (
          <div
            ref={setListEl}
            onScroll={handleScroll}
            className="flex max-h-80 flex-col gap-1 overflow-y-auto p-1.5">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onRead={markAsRead}
              />
            ))}
            {hasMore && nextPageFailed ? (
              <div className="flex flex-col items-center gap-1 py-2">
                <p className="text-muted-foreground text-xs">{tPanel("loadMoreFailed")}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={retryNextPage}
                  className="h-auto px-2 py-1 text-xs font-medium">
                  {tPanel("retry")}
                </Button>
              </div>
            ) : null}
            {hasMore && !nextPageFailed ? (
              <div className="text-muted-foreground py-2 text-center text-xs">
                {isFetchingNextPage ? tPanel("loadingMore") : null}
              </div>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
