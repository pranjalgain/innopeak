import { useLocale, useTranslations } from "next-intl";
import { LuWebhook } from "react-icons/lu";

import { formatRelativeTime } from "@/app/_libs/utils/relative-time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BillingWebhookEvent } from "@/types/domain";

interface BillingWebhookEventsCardProps {
  /** Already ordered newest-first and capped by the backend (`GET .../billing/summary`). */
  events: BillingWebhookEvent[];
}

export function BillingWebhookEventsCard({ events }: BillingWebhookEventsCardProps) {
  const t = useTranslations("adminBilling.webhookEvents");
  const locale = useLocale();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex items-start gap-3 py-1.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <LuWebhook className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{event.type}</p>
                <p className="text-[13px] text-muted-foreground">
                  {formatRelativeTime(event.processedAt, locale)}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
