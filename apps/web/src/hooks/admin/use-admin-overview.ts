
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

import { AdminActivityService } from "@/app/_libs/services/admin-activity.service";
import { AdminNeedsAttentionService } from "@/app/_libs/services/admin-needs-attention.service";
import { AdminOverviewStatsService } from "@/app/_libs/services/admin-overview-stats.service";
import { AdminRecentBusinessesService } from "@/app/_libs/services/admin-recent-businesses.service";
import { AdminSignupTrendService } from "@/app/_libs/services/admin-signup-trend.service";
import {
  type AdminActivityFeedEntry,
  buildActivityFeed,
} from "@/app/_libs/utils/admin-activity-feed";
import {
  adminOverviewActivityQueryKey,
  adminOverviewNeedsAttentionQueryKey,
  adminOverviewRecentBusinessesQueryKey,
  adminOverviewSignupTrendQueryKey,
  adminOverviewStatsQueryKey,
} from "@/hooks/admin/admin-query-keys";
import type { AdminBusiness, SignupTrendPoint } from "@/types/domain";

/** How many months `SignupTrendCard` shows, counting back from the current one. */
const SIGNUP_TREND_MONTHS = 6;

/** How many businesses to fetch for "Recent Businesses" — above `RecentBusinessesCard`'s own
 *  display count (3) and at least `buildActivityFeed`'s `FEED_LIMIT` (8), since that merge needs
 *  every business in this list to be a real candidate for the feed's final 8 slots, not just the
 *  three the card itself shows. */
const RECENT_BUSINESSES_LIMIT = 8;

/** How many rows `NeedsAttentionPanel` shows — matches the backend's own default. */
const NEEDS_ATTENTION_LIMIT = 3;

interface UseAdminOverviewResult {
  businessCount: number;
  userCount: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
  /** The newest businesses, newest first — feeds both `RecentBusinessesCard` and, merged with
   *  `activityQuery`, the activity feed's synthesized "business joined" entries. */
  recentBusinesses: AdminBusiness[];
  /** Non-connected businesses, most urgent first, already capped — an empty array means nothing
   *  needs attention right now, which is also what the parent view uses to decide whether to
   *  reserve layout space for the panel. */
  needsAttention: AdminBusiness[];
  /** Tenant signups bucketed by month over the trailing `SIGNUP_TREND_MONTHS` months — already
   *  zero-filled by the backend, so `SignupTrendCard` only has to render it. */
  signupTrend: SignupTrendPoint[];
  /** The admin-action log merged with synthesized "business joined" entries — see
   *  `buildActivityFeed`'s own doc comment for why the merge, rather than either source alone. */
  activityFeed: AdminActivityFeedEntry[];
  isLoading: boolean;
  /** Distinct from "loaded, but empty" — every panel needs to tell an outage from a quiet platform. */
  isError: boolean;
  /** Re-runs every underlying query — the page is an aggregate, so a partial retry would leave it inconsistent. */
  refetch: () => void;
}

/** Aggregates the Super Admin overview page's five independent queries — one per panel, each
 *  already shaped server-side for what that panel actually needs, rather than one wide fetch. */
export function useAdminOverview(): UseAdminOverviewResult {
  const t = useTranslations("adminOverview.toasts");

  const needsAttentionQuery = useQuery({
    queryKey: adminOverviewNeedsAttentionQueryKey,
    queryFn: () => AdminNeedsAttentionService.get(NEEDS_ATTENTION_LIMIT),
  });
  const statsQuery = useQuery({
    queryKey: adminOverviewStatsQueryKey,
    queryFn: () => AdminOverviewStatsService.get(),
  });
  const recentBusinessesQuery = useQuery({
    queryKey: adminOverviewRecentBusinessesQueryKey,
    queryFn: () => AdminRecentBusinessesService.get(RECENT_BUSINESSES_LIMIT),
  });
  const signupTrendQuery = useQuery({
    queryKey: adminOverviewSignupTrendQueryKey,
    queryFn: () => AdminSignupTrendService.get(SIGNUP_TREND_MONTHS),
  });
  const activityQuery = useQuery({
    queryKey: adminOverviewActivityQueryKey,
    queryFn: () => AdminActivityService.getRecentActivity(),
  });

  const isLoading =
    needsAttentionQuery.isLoading ||
    statsQuery.isLoading ||
    recentBusinessesQuery.isLoading ||
    signupTrendQuery.isLoading ||
    activityQuery.isLoading;

  // A single combined flag rather than one effect per query: the original only ever showed one
  // toast for the whole aggregate (`Promise.all` rejects — and its `.catch` runs — at most once),
  // and gating on the combined boolean (instead of each query's own `isError`) keeps that same
  // "fires once" behavior instead of one toast per failing source.
  const isAnyError =
    needsAttentionQuery.isError ||
    statsQuery.isError ||
    recentBusinessesQuery.isError ||
    signupTrendQuery.isError ||
    activityQuery.isError;

  useEffect(() => {
    if (isAnyError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnyError]);

  return {
    businessCount: statsQuery.data?.businessCount ?? 0,
    userCount: statsQuery.data?.userCount ?? 0,
    totalReviewsFetched: statsQuery.data?.totalReviewsFetched ?? 0,
    totalRepliesSent: statsQuery.data?.totalRepliesSent ?? 0,
    recentBusinesses: recentBusinessesQuery.data ?? [],
    needsAttention: needsAttentionQuery.data ?? [],
    signupTrend: signupTrendQuery.data ?? [],
    activityFeed: buildActivityFeed(recentBusinessesQuery.data ?? [], activityQuery.data ?? []),
    isLoading,
    isError: isAnyError,
    refetch: () => {
      void needsAttentionQuery.refetch();
      void statsQuery.refetch();
      void recentBusinessesQuery.refetch();
      void signupTrendQuery.refetch();
      void activityQuery.refetch();
    },
  };
}
