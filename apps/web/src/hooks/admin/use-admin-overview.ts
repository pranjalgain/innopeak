import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import { AdminBusinessService } from "@/app/_libs/services/admin-business.service";
import { AdminUserService } from "@/app/_libs/services/admin-user.service";
import { PlatformReviewStatsService } from "@/app/_libs/services/platform-review-stats.service";

interface UseAdminOverviewResult {
  businessCount: number;
  userCount: number;
  mrr: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
  isLoading: boolean;
}

/** Aggregates counts across the other admin services — no dedicated mock-data of its own (except review throughput, which has none to derive from). */
export function useAdminOverview(): UseAdminOverviewResult {
  const t = useTranslations("adminOverview.toasts");
  const [businessCount, setBusinessCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [totalReviewsFetched, setTotalReviewsFetched] = useState(0);
  const [totalRepliesSent, setTotalRepliesSent] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      AdminBusinessService.getBusinesses(),
      AdminUserService.getUsers(),
      AdminBillingService.getBilling(),
      PlatformReviewStatsService.get(),
    ])
      .then(([businesses, users, billing, reviewStats]) => {
        if (cancelled) return;
        setBusinessCount(businesses.length);
        setUserCount(users.length);
        setMrr(billing.reduce((sum, row) => sum + row.mrr, 0));
        setTotalReviewsFetched(reviewStats.totalReviewsFetched);
        setTotalRepliesSent(reviewStats.totalRepliesSent);
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

  return { businessCount, userCount, mrr, totalReviewsFetched, totalRepliesSent, isLoading };
}
