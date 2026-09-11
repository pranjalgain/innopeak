
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import { AdminBusinessService } from "@/app/_libs/services/admin-business.service";
import { AdminUserService } from "@/app/_libs/services/admin-user.service";
import { PlatformReviewStatsService } from "@/app/_libs/services/platform-review-stats.service";

export const adminOverviewBusinessesQueryKey = ["admin", "overview", "businesses"] as const;
export const adminOverviewUsersQueryKey = ["admin", "overview", "users"] as const;
export const adminOverviewBillingQueryKey = ["admin", "overview", "billing"] as const;
export const adminOverviewReviewStatsQueryKey = ["admin", "overview", "review-stats"] as const;

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

  const businessesQuery = useQuery({
    queryKey: adminOverviewBusinessesQueryKey,
    queryFn: () => AdminBusinessService.getBusinesses(),
  });
  const usersQuery = useQuery({
    queryKey: adminOverviewUsersQueryKey,
    queryFn: () => AdminUserService.getUsers(),
  });
  const billingQuery = useQuery({
    queryKey: adminOverviewBillingQueryKey,
    queryFn: () => AdminBillingService.getBilling(),
  });
  const reviewStatsQuery = useQuery({
    queryKey: adminOverviewReviewStatsQueryKey,
    queryFn: () => PlatformReviewStatsService.get(),
  });

  const isLoading =
    businessesQuery.isLoading ||
    usersQuery.isLoading ||
    billingQuery.isLoading ||
    reviewStatsQuery.isLoading;

  // A single combined flag rather than one effect per query: the original only ever showed one
  // toast for the whole aggregate (`Promise.all` rejects — and its `.catch` runs — at most once),
  // and gating on the combined boolean (instead of each query's own `isError`) keeps that same
  // "fires once" behavior instead of one toast per failing source.
  const isAnyError =
    businessesQuery.isError || usersQuery.isError || billingQuery.isError || reviewStatsQuery.isError;

  useEffect(() => {
    if (isAnyError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnyError]);

  return {
    businessCount: businessesQuery.data?.length ?? 0,
    userCount: usersQuery.data?.length ?? 0,
    mrr: billingQuery.data?.reduce((sum, row) => sum + row.mrr, 0) ?? 0,
    totalReviewsFetched: reviewStatsQuery.data?.totalReviewsFetched ?? 0,
    totalRepliesSent: reviewStatsQuery.data?.totalRepliesSent ?? 0,
    isLoading,
  };
}
