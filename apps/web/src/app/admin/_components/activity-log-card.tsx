import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import { LuMail, LuMailX, LuUserCheck, LuUserX } from "react-icons/lu";

import { formatRelativeTime } from "@/app/_libs/utils/relative-time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlatformActivityEntry, PlatformActivityType } from "@/types/domain";

interface ActivityLogCardProps {
  entries: PlatformActivityEntry[];
}

const TYPE_ICON: Record<PlatformActivityType, ComponentType<{ className?: string }>> = {
  business_suspended: LuUserX,
  business_reactivated: LuUserCheck,
  admin_invite_sent: LuMail,
  admin_invite_revoked: LuMailX,
};

const TYPE_ICON_CLASSNAME: Record<PlatformActivityType, string> = {
  business_suspended: "bg-destructive-soft text-destructive",
  business_reactivated: "bg-success-soft text-success",
  admin_invite_sent: "bg-accent text-primary",
  admin_invite_revoked: "bg-warning-soft text-warning",
};

export function ActivityLogCard({ entries }: ActivityLogCardProps) {
  const t = useTranslations("adminOverview.activityLog");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          entries.map((entry) => {
            const Icon = TYPE_ICON[entry.type];
            return (
              <div key={entry.id} className="flex items-start gap-3 py-1.5">
                <span
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${TYPE_ICON_CLASSNAME[entry.type]}`}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {t(`messages.${entry.type}`, { businessName: entry.businessName ?? "", email: entry.email ?? "" })}
                  </p>
                  <p className="text-[13px] text-muted-foreground">{formatRelativeTime(entry.occurredAt)}</p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
