import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import { adminBillingWebhookEventsQueryKey } from "@/hooks/admin/admin-query-keys";
import type { BillingWebhookEvent, StripeWebhookEventTypeKey } from "@/types/domain";

/** `"all"` (every event type `BillingWebhooksService` acts on — the only ones this endpoint ever
 *  returns) or one of `StripeWebhookEventType`'s own key names to narrow to a single type. The
 *  raw, ignored Stripe traffic this app receives isn't exposed here at all — that's an
 *  engineering debugging concern for Stripe's own Dashboard event log or backend logs, not
 *  something a platform admin needs to reason about. */
export type WebhookEventFilter = "all" | StripeWebhookEventTypeKey;

interface UseAdminBillingWebhookEventsResult {
  events: BillingWebhookEvent[];
  filter: WebhookEventFilter;
  setFilter: (filter: WebhookEventFilter) => void;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
  total: number;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
}

const PAGE_SIZE = 10;

interface WebhookEventsQueryParams {
  page: number;
  pageSize: number;
  type?: StripeWebhookEventTypeKey | undefined;
}

const webhookEventsQueryKey = (params: WebhookEventsQueryParams) =>
  [...adminBillingWebhookEventsQueryKey, params] as const;

/**
 * Webhook activity, paginated and filtered **server-side** — same reasoning as
 * `useReviewQueue`'s own doc comment: this fetches exactly the page being displayed, using
 * `GET /v1/admin/billing/webhook-events`'s own `page`/`pageSize`/`meta`, rather than loading one
 * batch and re-slicing it client-side.
 */
export function useAdminBillingWebhookEvents(): UseAdminBillingWebhookEventsResult {
  const t = useTranslations("adminBilling.toasts");
  const [page, setPageState] = useState(1);
  const [filter, setFilterState] = useState<WebhookEventFilter>("all");

  const type = filter !== "all" ? filter : undefined;

  // A filter change invalidates the current page — page 3 of one filter may not exist once a
  // narrower one applies. Adjusted during render (not an effect) for the same reason
  // `useReviewQueue` does: an effect runs after the render that would otherwise fetch the stale
  // page under the new filter first.
  const paramsKey = filter;
  const [lastParamsKey, setLastParamsKey] = useState(paramsKey);
  if (lastParamsKey !== paramsKey) {
    setLastParamsKey(paramsKey);
    setPageState(1);
  }

  const queryParams: WebhookEventsQueryParams = { page, pageSize: PAGE_SIZE, type };

  const eventsQuery = useQuery({
    queryKey: webhookEventsQueryKey(queryParams),
    queryFn: () => AdminBillingService.listWebhookEvents(queryParams),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (eventsQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsQuery.isError]);

  const total = eventsQuery.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setPage = useCallback(
    (next: number) => setPageState(Math.min(Math.max(next, 1), totalPages)),
    [totalPages],
  );

  return {
    events: eventsQuery.data?.events ?? [],
    filter,
    setFilter: setFilterState,
    // The genuine first load only — `eventsQuery.isFetching` also flips true on every filter/page
    // change once data already exists, and the card hides its Pagination footer whenever this is
    // true. `placeholderData: keepPreviousData` already keeps the previous page's rows/`total` on
    // screen while the next one loads, so Pagination has no reason to disappear on every click.
    isLoading: eventsQuery.isLoading,
    isError: eventsQuery.isError,
    retry: () => {
      void eventsQuery.refetch();
    },
    total,
    page,
    totalPages,
    setPage,
    goToPreviousPage: () => setPage(page - 1),
    goToNextPage: () => setPage(page + 1),
  };
}
