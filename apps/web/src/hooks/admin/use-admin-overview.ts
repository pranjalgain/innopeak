
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

import { AdminActivityService } from "@/app/_libs/services/admin-activity.service";
import { AdminBusinessService } from "@/app/_libs/services/admin-business.service";
import { AdminUserService } from "@/app/_libs/services/admin-user.service";
import { PlatformReviewStatsService } from "@/app/_libs/services/platform-review-stats.service";
import {
  type AdminActivityFeedEntry,
  buildActivityFeed,
} from "@/app/_libs/utils/admin-activity-feed";
import {
  adminBusinessesQueryKey,
  adminOverviewActivityQueryKey,
  adminOverviewReviewStatsQueryKey,
  adminUsersQueryKey,
} from "@/hooks/admin/admin-query-keys";
import type { AdminBusiness } from "@/types/domain";

interface UseAdminOverviewResult {
  /** The raw rows — the needs-attention/recent-businesses/signup-trend panels each derive their own view from this same list rather than each fetching separately. */
  businesses: AdminBusiness[];
  businessCount: number;
  userCount: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
  /** The admin-action log merged with synthesized "business joined" entries — see
   *  `buildActivityFeed`'s own doc comment for why the merge, rather than either source alone. */
  activityFeed: AdminActivityFeedEntry[];
  isLoading: boolean;
  /** Distinct from "loaded, but empty" — every panel needs to tell an outage from a quiet platform. */
  isError: boolean;
  /** Re-runs every underlying query — the page is an aggregate, so a partial retry would leave it inconsistent. */
  refetch: () => void;
}

/** Aggregates counts across the other admin services — no dedicated mock-data of its own (except review throughput, which has none to derive from). */
export function useAdminOverview(): UseAdminOverviewResult {
  const t = useTranslations("adminOverview.toasts");

  // The SAME keys the Businesses and Users screens use, not private `admin/overview/*` copies of
  // them. Two keys over one endpoint meant two independent caches: suspending a business updated
  // the list screen's copy and left this one showing the pre-suspension state for the full 5-minute
  // staleTime — and since `refetchOnWindowFocus` is off, in practice until a hard reload.
  const businessesQuery = useQuery({
    queryKey: adminBusinessesQueryKey,
    queryFn: () => AdminBusinessService.getBusinesses(),
  });
  const usersQuery = useQuery({
    queryKey: adminUsersQueryKey,
    queryFn: () => AdminUserService.getUsers(),
  });
  const reviewStatsQuery = useQuery({
    queryKey: adminOverviewReviewStatsQueryKey,
    queryFn: () => PlatformReviewStatsService.get(),
  });
  const activityQuery = useQuery({
    queryKey: adminOverviewActivityQueryKey,
    queryFn: () => AdminActivityService.getRecentActivity(),
  });

  const isLoading =
    businessesQuery.isLoading ||
    usersQuery.isLoading ||
    reviewStatsQuery.isLoading ||
    activityQuery.isLoading;

  // A single combined flag rather than one effect per query: the original only ever showed one
  // toast for the whole aggregate (`Promise.all` rejects — and its `.catch` runs — at most once),
  // and gating on the combined boolean (instead of each query's own `isError`) keeps that same
  // "fires once" behavior instead of one toast per failing source.
  const isAnyError =
    businessesQuery.isError || usersQuery.isError || reviewStatsQuery.isError || activityQuery.isError;

  useEffect(() => {
    if (isAnyError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnyError]);

  return {
    businesses: businessesQuery.data ?? [],
    businessCount: businessesQuery.data?.length ?? 0,
    userCount: usersQuery.data?.length ?? 0,
    totalReviewsFetched: reviewStatsQuery.data?.totalReviewsFetched ?? 0,
    totalRepliesSent: reviewStatsQuery.data?.totalRepliesSent ?? 0,
    activityFeed: buildActivityFeed(businessesQuery.data ?? [], activityQuery.data ?? []),
    isLoading,
    isError: isAnyError,
    refetch: () => {
      void businessesQuery.refetch();
      void usersQuery.refetch();
      void reviewStatsQuery.refetch();
      void activityQuery.refetch();
    },
  };
}
