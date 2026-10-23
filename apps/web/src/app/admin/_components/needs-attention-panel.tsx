import Link from "next/link";
import { useTranslations } from "next-intl";

import { ROUTES } from "@/app/_libs/constants/routes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminBusiness, BusinessConnectionStatus } from "@/types/domain";

interface NeedsAttentionPanelProps {
  /** Backend already filters to non-connected, sorts most urgent first, and caps. */
  businesses: AdminBusiness[];
}

const STATUS_BADGE_CLASSNAME: Record<Exclude<BusinessConnectionStatus, "connected">, string> = {
  needs_reauth: "border-transparent bg-warning-soft text-warning",
  disconnected: "border-transparent bg-destructive-soft text-destructive",
  never_connected: "border-transparent bg-muted text-muted-foreground",
};

export function NeedsAttentionPanel({ businesses }: NeedsAttentionPanelProps) {
  const t = useTranslations("adminOverview.needsAttention");

  // An empty "all clear" card is noise; the parent gives RecentBusinessesCard the full row instead.
  if (businesses.length === 0) return null;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {businesses.map((business) => (
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
        ))}

        <Link
          href={ROUTES.ADMIN_BUSINESSES}
          className="text-primary hover:text-primary/80 mt-auto pt-3 text-sm font-medium no-underline transition-colors"
        >
          {t("viewAll")}
        </Link>
      </CardContent>
    </Card>
  );
}
