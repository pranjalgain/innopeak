import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

import { AdminActivityService } from "@/app/_libs/services/admin-activity.service";
import { adminOverviewActivityLogQueryKey } from "@/hooks/admin/admin-query-keys";
import { useUrlFilterPage } from "@/hooks/common/use-url-filter-page";
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

/** The action types the filter offers (a subset of `PlatformActivityType`: the log screen leaves out erasure lifecycle entries). */
export const PLATFORM_ACTIVITY_FILTER_TYPES: PlatformActivityType[] = [
  "business_suspended",
  "business_reactivated",
  "admin_invite_sent",
  "admin_invite_revoked",
  "admin_disabled",
  "admin_enabled",
  "user_activated",
  "user_deactivated",
];

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
  // Page and filter live in the URL (`?page=2&type=user_activated`), so Back/Forward and a reload keep your place.
  const { filter, setFilter, page, setPage: setPageInUrl, clampPage } = useUrlFilterPage(
    "type",
    PLATFORM_ACTIVITY_FILTER_TYPES,
  );
  const type = filter !== "all" ? filter : undefined;

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

  const setPage = (next: number) => setPageInUrl(Math.min(Math.max(next, 1), totalPages));

  // A stale `?page=` (an old link, a list that shrank) is pulled back to the last real page.
  useEffect(() => {
    if (activityQuery.data) clampPage(totalPages);
  }, [activityQuery.data, totalPages, clampPage]);

  return {
    activities: activityQuery.data?.activities ?? [],
    filter,
    setFilter,
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
