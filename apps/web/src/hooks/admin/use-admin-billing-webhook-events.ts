import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import { adminBillingWebhookEventsQueryKey } from "@/hooks/admin/admin-query-keys";
import { useUrlFilterPage } from "@/hooks/common/use-url-filter-page";
import {
  type BillingWebhookEvent,
  StripeWebhookEventType,
  type StripeWebhookEventTypeKey,
} from "@/types/domain";

/** `"all"` (every type `BillingWebhooksService` acts on) or one `StripeWebhookEventType` key; ignored Stripe traffic is not exposed. */
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

/** The event types the filter offers, as the keys the URL and the API both use. */
const WEBHOOK_FILTER_VALUES = Object.keys(StripeWebhookEventType) as StripeWebhookEventTypeKey[];

interface WebhookEventsQueryParams {
  page: number;
  pageSize: number;
  type?: StripeWebhookEventTypeKey | undefined;
}

const webhookEventsQueryKey = (params: WebhookEventsQueryParams) =>
  [...adminBillingWebhookEventsQueryKey, params] as const;

/** Paginated and filtered server-side, like `useReviewQueue`. */
export function useAdminBillingWebhookEvents(): UseAdminBillingWebhookEventsResult {
  const t = useTranslations("adminBilling.toasts");
  // Page and filter live in the URL (`?page=2&type=SUBSCRIPTION_UPDATED`), so Back/Forward and a reload keep your place.
  const { filter, setFilter, page, setPage: setPageInUrl, clampPage } = useUrlFilterPage(
    "type",
    WEBHOOK_FILTER_VALUES,
  );
  const type = filter !== "all" ? filter : undefined;

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

  const setPage = (next: number) => setPageInUrl(Math.min(Math.max(next, 1), totalPages));

  // A stale `?page=` (an old link, a list that shrank) is pulled back to the last real page.
  useEffect(() => {
    if (eventsQuery.data) clampPage(totalPages);
  }, [eventsQuery.data, totalPages, clampPage]);

  return {
    events: eventsQuery.data?.events ?? [],
    filter,
    setFilter,
    // First load only: `isFetching` also flips on every filter/page change, and `keepPreviousData`
    // already keeps the old rows on screen, so Pagination shouldn't vanish on each click.
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
