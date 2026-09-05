import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import * as React from "react";
import { LuBell, LuCheck, LuClock, LuTriangleAlert, LuWifiOff } from "react-icons/lu";

import { ROUTES } from "@/app/_libs/constants/routes";
import { cn } from "@/app/_libs/utils/cn";
import { formatRelativeTime } from "@/app/_libs/utils/relative-time";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePagination } from "@/hooks/common/use-pagination";
import { useNotifications } from "@/hooks/notifications/use-notifications";
import type { Notification, NotificationType } from "@/types/domain";

const TYPE_ICON: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
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

  const content = (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md p-2.5 transition-colors ease-fluid hover:bg-accent",
        !notification.isRead && "bg-accent/50",
      )}
    >
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TYPE_ICON_CLASSNAME[notification.type])}>
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{notification.title}</p>
          {!notification.isRead ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{notification.description}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatRelativeTime(notification.createdAt)}</p>
      </div>
    </div>
  );

  if (notification.reviewId) {
    return (
      <Link href={ROUTES.REVIEW_DETAIL(notification.reviewId) as Route} onClick={() => onRead(notification.id)}>
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
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { page, totalPages, pageItems, goToPreviousPage, goToNextPage } = usePagination(notifications, 3);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("notifications")} className="relative">
          <LuBell className="size-4.5" />
          {unreadCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 flex size-2 rounded-full bg-destructive" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
          <p className="text-sm font-semibold">{tPanel("title")}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0}
            onClick={markAllAsRead}
            className="h-auto px-1.5 py-1 text-xs font-medium"
          >
            {tPanel("markAllRead")}
          </Button>
        </div>

        {notifications.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">{tPanel("empty")}</p>
        ) : (
          <>
            <div className="flex max-h-80 flex-col gap-1 overflow-y-auto p-1.5">
              {pageItems.map((notification) => (
                <NotificationRow key={notification.id} notification={notification} onRead={markAsRead} />
              ))}
            </div>
            <div className="border-t border-border px-3.5 py-2.5">
              <Pagination page={page} totalPages={totalPages} onPrevious={goToPreviousPage} onNext={goToNextPage} />
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
