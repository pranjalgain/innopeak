import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { AdminActivityService } from "@/app/_libs/services/admin-activity.service";
import { AdminBusinessService } from "@/app/_libs/services/admin-business.service";
import { AdminUserService } from "@/app/_libs/services/admin-user.service";
import { PlatformReviewStatsService } from "@/app/_libs/services/platform-review-stats.service";
import type { AdminBusiness, PlatformActivityEntry } from "@/types/domain";

interface UseAdminOverviewResult {
  businesses: AdminBusiness[];
  businessCount: number;
  userCount: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
  recentActivity: PlatformActivityEntry[];
  isLoading: boolean;
}

/** Aggregates counts across the other admin services — no dedicated mock-data of its own (except review throughput, which has none to derive from). */
export function useAdminOverview(): UseAdminOverviewResult {
  const t = useTranslations("adminOverview.toasts");
  const [businesses, setBusinesses] = React.useState<AdminBusiness[]>([]);
  const [userCount, setUserCount] = React.useState(0);
  const [totalReviewsFetched, setTotalReviewsFetched] = React.useState(0);
  const [totalRepliesSent, setTotalRepliesSent] = React.useState(0);
  const [recentActivity, setRecentActivity] = React.useState<PlatformActivityEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    Promise.all([
      AdminBusinessService.getBusinesses(),
      AdminUserService.getUsers(),
      PlatformReviewStatsService.get(),
      AdminActivityService.getRecentActivity(),
    ])
      .then(([businessesResult, users, reviewStats, activity]) => {
        if (cancelled) return;
        setBusinesses(businessesResult);
        setUserCount(users.length);
        setTotalReviewsFetched(reviewStats.totalReviewsFetched);
        setTotalRepliesSent(reviewStats.totalRepliesSent);
        setRecentActivity(activity);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  return {
    businesses,
    businessCount: businesses.length,
    userCount,
    totalReviewsFetched,
    totalRepliesSent,
    recentActivity,
    isLoading,
  };
}
