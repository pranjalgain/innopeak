import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { ROUTES } from "@/app/_libs/constants/routes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminBusiness, BusinessConnectionStatus } from "@/types/domain";

interface NeedsAttentionPanelProps {
  businesses: AdminBusiness[];
}

const STATUS_BADGE_CLASSNAME: Record<Exclude<BusinessConnectionStatus, "connected">, string> = {
  needs_reauth: "border-transparent bg-warning-soft text-warning",
  disconnected: "border-transparent bg-destructive-soft text-destructive",
  never_connected: "border-transparent bg-muted text-muted-foreground",
};

const MAX_ROWS = 3;

/**
 * Lower sorts first. A broken connection on a live customer outranks a tenant that never
 * onboarded: the list arrives newest-first and only shows three rows, so without this the newest
 * signups — almost always never-onboarded ones — permanently filled every slot and a genuine
 * mid-life disconnection was never visible here at all.
 */
const ATTENTION_PRIORITY: Record<Exclude<BusinessConnectionStatus, "connected">, number> = {
  disconnected: 0,
  needs_reauth: 1,
  never_connected: 2,
};

export function NeedsAttentionPanel({ businesses }: NeedsAttentionPanelProps) {
  const t = useTranslations("adminOverview.needsAttention");
  const atRisk = businesses
    .filter((business) => business.connectionStatus !== "connected")
    .sort(
      (a, b) =>
        ATTENTION_PRIORITY[a.connectionStatus as Exclude<BusinessConnectionStatus, "connected">] -
        ATTENTION_PRIORITY[b.connectionStatus as Exclude<BusinessConnectionStatus, "connected">],
    )
    .slice(0, MAX_ROWS);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {atRisk.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          atRisk.map((business) => (
            <div key={business.id} className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{business.name}</p>
                <p className="truncate text-[13px] text-muted-foreground">{business.ownerName}</p>
              </div>
              <Badge
                variant="outline"
                className={
                  STATUS_BADGE_CLASSNAME[
                    business.connectionStatus as Exclude<BusinessConnectionStatus, "connected">
                  ]
                }
              >
                {t(`statuses.${business.connectionStatus}`)}
              </Badge>
            </div>
          ))
        )}

        <Link
          href={ROUTES.ADMIN_BUSINESSES as Route}
          className="text-primary hover:text-primary/80 mt-auto pt-3 text-sm font-medium no-underline transition-colors"
        >
          {t("viewAll")}
        </Link>
      </CardContent>
    </Card>
  );
}
