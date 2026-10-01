import type { Route } from "next";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ComponentType } from "react";
import {
  LuBuilding2,
  LuMail,
  LuMailX,
  LuShieldCheck,
  LuShieldOff,
  LuTrash2,
  LuUserCheck,
  LuUserMinus,
  LuUserPlus,
  LuUserX,
} from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";
import { formatRelativeTime } from "@/app/_libs/utils/relative-time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlatformActivityEntry } from "@/types/domain";

interface ActivityLogCardProps {
  entries: PlatformActivityEntry[];
  /** Shows a "view all" link to the dedicated Activity page — omitted when this card is already
   *  rendered there (the Platform activity tab), where linking to itself would be redundant. */
  viewAllHref?: Route;
}

/** Exported for `PlatformActivityLogCard` (the dedicated Activity page's paginated view) to reuse
 *  — same icon/color language for the same entry types, not a separate palette to keep in sync. */
export const TYPE_ICON: Record<
  PlatformActivityEntry["type"],
  ComponentType<{ className?: string }>
> = {
  business_suspended: LuUserX,
  business_reactivated: LuUserCheck,
  business_erasure_requested: LuTrash2,
  business_erasure_cancelled: LuUserCheck,
  business_erased: LuTrash2,
  admin_invite_sent: LuMail,
  admin_invite_revoked: LuMailX,
  admin_disabled: LuShieldOff,
  admin_enabled: LuShieldCheck,
  user_activated: LuUserPlus,
  user_deactivated: LuUserMinus,
  business_joined: LuBuilding2,
};

export const TYPE_ICON_CLASSNAME: Record<PlatformActivityEntry["type"], string> = {
  business_suspended: "bg-destructive-soft text-destructive",
  business_reactivated: "bg-success-soft text-success",
  business_erasure_requested: "bg-destructive-soft text-destructive",
  business_erasure_cancelled: "bg-success-soft text-success",
  business_erased: "bg-muted text-muted-foreground",
  admin_invite_sent: "bg-accent text-primary",
  admin_invite_revoked: "bg-warning-soft text-warning",
  admin_disabled: "bg-destructive-soft text-destructive",
  admin_enabled: "bg-success-soft text-success",
  user_activated: "bg-success-soft text-success",
  user_deactivated: "bg-destructive-soft text-destructive",
  business_joined: "bg-accent text-primary",
};

export function ActivityLogCard({ entries, viewAllHref }: ActivityLogCardProps) {
  const t = useTranslations("adminOverview.activityLog");
  const locale = useLocale();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          entries.map((entry) => {
            const Icon = TYPE_ICON[entry.type];
            return (
              <div key={entry.id} className="flex items-start gap-3 py-1.5">
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                    TYPE_ICON_CLASSNAME[entry.type],
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {t(`messages.${entry.type}`, {
                      businessName: entry.businessName ?? "",
                      email: entry.email ?? "",
                    })}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatRelativeTime(entry.occurredAt, locale)}
                  </p>
                </div>
              </div>
            );
          })
        )}

        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="text-primary hover:text-primary/80 mt-auto pt-3 text-sm font-medium no-underline transition-colors"
          >
            {t("viewAll")}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
