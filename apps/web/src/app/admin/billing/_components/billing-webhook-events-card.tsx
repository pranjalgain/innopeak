import { useLocale, useTranslations } from "next-intl";
import { LuCircleCheck, LuCircleX, LuWebhook } from "react-icons/lu";

import { formatRelativeTime } from "@/app/_libs/utils/relative-time";
import { humanizeStripeEventType } from "@/app/_libs/utils/stripe-webhook";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Pagination } from "@/components/common/pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAdminBillingWebhookEvents,
  type WebhookEventFilter,
} from "@/hooks/admin/use-admin-billing-webhook-events";
import {
  type BillingWebhookEvent,
  HANDLED_STRIPE_WEBHOOK_EVENT_TYPES,
  StripeWebhookEventType,
} from "@/types/domain";

const EVENT_TYPE_LABEL_KEYS: Record<(typeof HANDLED_STRIPE_WEBHOOK_EVENT_TYPES)[number], string> = {
  "checkout.session.completed": "checkoutSessionCompleted",
  "customer.subscription.updated": "subscriptionUpdated",
  "customer.subscription.deleted": "subscriptionDeleted",
  "invoice.payment_failed": "invoicePaymentFailed",
  "invoice.payment_succeeded": "invoicePaymentSucceeded",
};

const PAYMENT_SUCCEEDED_TYPE = "invoice.payment_succeeded";
const PAYMENT_FAILED_TYPE = "invoice.payment_failed";

/** Every returned event is one of the 5 types `BillingWebhooksService` handles, so `humanizeStripeEventType` is only a defensive fallback. */
function eventTypeLabel(event: BillingWebhookEvent, t: ReturnType<typeof useTranslations>): string {
  const labelKey = EVENT_TYPE_LABEL_KEYS[event.type as (typeof HANDLED_STRIPE_WEBHOOK_EVENT_TYPES)[number]];
  if (labelKey) return t(`filters.eventTypes.${labelKey}`);
  return humanizeStripeEventType(event.type);
}

/** Only payment-outcome types get a success/failure icon; a broader rule would show an orphan `checkout.session.completed` (handled, nothing happened) as a success. */
function EventIcon({ type }: { type: string }) {
  if (type === PAYMENT_SUCCEEDED_TYPE) {
    return (
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
        <LuCircleCheck className="size-3.5" />
      </span>
    );
  }
  if (type === PAYMENT_FAILED_TYPE) {
    return (
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive-soft text-destructive">
        <LuCircleX className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
      <LuWebhook className="size-3.5" />
    </span>
  );
}

export function BillingWebhookEventsCard() {
  const t = useTranslations("adminBilling.webhookEvents");
  const locale = useLocale();
  const {
    events,
    filter,
    setFilter,
    isLoading,
    isError,
    retry,
    total,
    page,
    totalPages,
    goToPreviousPage,
    goToNextPage,
  } = useAdminBillingWebhookEvents();

  const isFiltered = filter !== "all";

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as WebhookEventFilter)}>
          <SelectTrigger size="sm" aria-label={t("filters.label")} className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.all")}</SelectItem>
            {Object.entries(StripeWebhookEventType).map(([key, rawType]) => (
              <SelectItem key={key} value={key}>
                {t(`filters.eventTypes.${EVENT_TYPE_LABEL_KEYS[rawType]}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {/* Fixed height on larger screens keeps the pagination footer in place on a short last page; mobile hugs the content. */}
        <div className="flex flex-1 flex-col gap-1 sm:min-h-[600px]">
          {isError ? (
            <LoadErrorState onRetry={retry} />
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isFiltered ? t("noResults") : t("empty")}
            </p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex items-start gap-3 py-1.5">
                <EventIcon type={event.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{eventTypeLabel(event, t)}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {event.businessName ?? t("unknownBusiness")} ·{" "}
                    {formatRelativeTime(event.processedAt, locale)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        {!isLoading && total > 0 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
