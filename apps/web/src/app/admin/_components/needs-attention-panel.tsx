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
};

const MAX_ROWS = 3;

export function NeedsAttentionPanel({ businesses }: NeedsAttentionPanelProps) {
  const t = useTranslations("adminOverview.needsAttention");
  const atRisk = businesses.filter((business) => business.connectionStatus !== "connected").slice(0, MAX_ROWS);

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
                  STATUS_BADGE_CLASSNAME[business.connectionStatus as Exclude<BusinessConnectionStatus, "connected">]
                }
              >
                {t(`statuses.${business.connectionStatus}`)}
              </Badge>
            </div>
          ))
        )}

        <Link
          href={ROUTES.ADMIN_BUSINESSES as Route}
          className="mt-auto pt-3 text-sm font-medium text-primary no-underline transition-colors hover:text-primary/80"
        >
          {t("viewAll")}
        </Link>
      </CardContent>
    </Card>
  );
}
