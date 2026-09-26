import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AtRiskSubscription } from "@/types/domain";

interface AtRiskSubscriptionsPanelProps {
  /** Already filtered to past-due subscriptions, most-recently-updated first, and capped — by the
   *  backend (`GET .../billing/summary`). This component only renders it. */
  subscriptions: AtRiskSubscription[];
}

export function AtRiskSubscriptionsPanel({ subscriptions }: AtRiskSubscriptionsPanelProps) {
  const t = useTranslations("adminBilling.atRisk");
  const format = useFormatter();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          subscriptions.map((subscription) => (
            <div
              key={subscription.tenantId}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{subscription.businessName}</p>
                {subscription.currentPeriodEnd && (
                  <p className="truncate text-[13px] text-muted-foreground">
                    {t("periodEnded", {
                      date: format.dateTime(new Date(subscription.currentPeriodEnd), {
                        dateStyle: "medium",
                      }),
                    })}
                  </p>
                )}
              </div>
              <Badge variant="outline" className="border-transparent bg-destructive-soft text-destructive">
                {t("statuses.past_due")}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
