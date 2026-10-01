import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminActivityService } from "@/app/_libs/services/admin-activity.service";
import { adminOverviewActivityLogQueryKey } from "@/hooks/admin/admin-query-keys";
import type { PlatformActivityEntry, PlatformActivityType } from "@/types/domain";

/** `"all"` or one of the 8 real `PlatformActivityType` values. */
export type PlatformActivityFilter = "all" | PlatformActivityType;

interface UseAdminPlatformActivityLogResult {
  activities: PlatformActivityEntry[];
  filter: PlatformActivityFilter;
  setFilter: (filter: PlatformActivityFilter) => void;
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

interface ActivityLogQueryParams {
  page: number;
  pageSize: number;
  type?: PlatformActivityType | undefined;
}

const activityLogQueryKey = (params: ActivityLogQueryParams) =>
  [...adminOverviewActivityLogQueryKey, params] as const;

/**
 * Platform-admin action history, paginated and filtered **server-side** — same reasoning as
 * `useAdminBillingWebhookEvents`/`useReviewQueue`'s own doc comments. Real `platform_activity_log`
 * rows only, distinct from the Overview glance card's own merged feed (`useAdminOverview`'s
 * `activityFeed`, synthesized "business joined" entries included), which has no server-side
 * pagination of its own — see `AdminOverviewRepository.listActivity`'s own comment for why the two
 * stay separate.
 */
export function useAdminPlatformActivityLog(): UseAdminPlatformActivityLogResult {
  const t = useTranslations("adminOverview.toasts");
  const [page, setPageState] = useState(1);
  const [filter, setFilterState] = useState<PlatformActivityFilter>("all");

  const type = filter !== "all" ? filter : undefined;

  // A filter change invalidates the current page — same reasoning as the webhook-events hook.
  const paramsKey = filter;
  const [lastParamsKey, setLastParamsKey] = useState(paramsKey);
  if (lastParamsKey !== paramsKey) {
    setLastParamsKey(paramsKey);
    setPageState(1);
  }

  const queryParams: ActivityLogQueryParams = { page, pageSize: PAGE_SIZE, type };

  const activityQuery = useQuery({
    queryKey: activityLogQueryKey(queryParams),
    queryFn: () => AdminActivityService.listActivity(queryParams),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (activityQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityQuery.isError]);

  const total = activityQuery.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setPage = useCallback(
    (next: number) => setPageState(Math.min(Math.max(next, 1), totalPages)),
    [totalPages],
  );

  return {
    activities: activityQuery.data?.activities ?? [],
    filter,
    setFilter: setFilterState,
    // The genuine first load only — `activityQuery.isFetching` also flips true on every filter/page
    // change once data already exists, and the card hides its Pagination footer whenever this is
    // true. `placeholderData: keepPreviousData` already keeps the previous page's rows/`total` on
    // screen while the next one loads, so Pagination has no reason to disappear on every click.
    isLoading: activityQuery.isLoading,
    isError: activityQuery.isError,
    retry: () => {
      void activityQuery.refetch();
    },
    total,
    page,
    totalPages,
    setPage,
    goToPreviousPage: () => setPage(page - 1),
    goToNextPage: () => setPage(page + 1),
  };
}
