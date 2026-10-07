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

/** Paginated and filtered server-side; real `platform_activity_log` rows only, unlike the Overview's merged feed (see `AdminOverviewRepository.listActivity`). */
export function useAdminPlatformActivityLog(): UseAdminPlatformActivityLogResult {
  const t = useTranslations("adminOverview.toasts");
  const [page, setPageState] = useState(1);
  const [filter, setFilterState] = useState<PlatformActivityFilter>("all");

  const type = filter !== "all" ? filter : undefined;

  // A filter change can leave the current page out of range (see the webhook-events hook).
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
    // First load only: `isFetching` also flips on every filter/page change, and `keepPreviousData`
    // already keeps the old rows on screen, so Pagination shouldn't vanish on each click.
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
