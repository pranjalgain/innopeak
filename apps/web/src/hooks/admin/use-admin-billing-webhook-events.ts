import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import { adminBillingWebhookEventsQueryKey } from "@/hooks/admin/admin-query-keys";
import type { BillingWebhookEvent, StripeWebhookEventTypeKey } from "@/types/domain";

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
  const [page, setPageState] = useState(1);
  const [filter, setFilterState] = useState<WebhookEventFilter>("all");

  const type = filter !== "all" ? filter : undefined;

  // A filter change can leave the current page out of range. Adjusted during render, not in an
  // effect, so the stale page is never fetched under the new filter first.
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
