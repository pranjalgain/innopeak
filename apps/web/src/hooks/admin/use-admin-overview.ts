
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
  adminOverviewActivityQueryKey,
  adminOverviewNeedsAttentionQueryKey,
  adminOverviewRecentBusinessesQueryKey,
  adminOverviewSignupTrendQueryKey,
  adminOverviewStatsQueryKey,
} from "@/hooks/admin/admin-query-keys";
import type { AdminBusiness, PlatformActivityEntry, SignupTrendPoint } from "@/types/domain";

/** How many months `SignupTrendCard` shows, counting back from the current one. */
const SIGNUP_TREND_MONTHS = 6;

/** Matches `RecentBusinessesCard`'s display count. */
const RECENT_BUSINESSES_LIMIT = 3;

/** How many rows `NeedsAttentionPanel` shows — matches the backend's own default. */
const NEEDS_ATTENTION_LIMIT = 3;

interface UseAdminOverviewResult {
  businessCount: number;
  userCount: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
  /** The newest businesses, newest first — feeds `RecentBusinessesCard`. */
  recentBusinesses: AdminBusiness[];
  /** Non-connected businesses, most urgent first, already capped; empty means nothing needs attention. */
  needsAttention: AdminBusiness[];
  /** Tenant signups by month over the trailing `SIGNUP_TREND_MONTHS`, already zero-filled by the backend. */
  signupTrend: SignupTrendPoint[];
  /** Admin-action log merged server-side with synthesized "business joined" entries. */
  activityFeed: PlatformActivityEntry[];
  isLoading: boolean;
  /** Distinct from "loaded, but empty" — every panel needs to tell an outage from a quiet platform. */
  isError: boolean;
  /** Re-runs every underlying query — the page is an aggregate, so a partial retry would leave it inconsistent. */
  refetch: () => void;
}

/** Aggregates the overview page's five independent queries, one per panel. */
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

  // A single combined flag so the aggregate shows one toast, not one per failing query.
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
    activityFeed: activityQuery.data ?? [],
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
