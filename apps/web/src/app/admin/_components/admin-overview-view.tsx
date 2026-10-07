"use client";

import type { Route } from "next";
import { useFormatter, useTranslations } from "next-intl";
import { LuBuilding2, LuMessageSquare, LuReply, LuUsers } from "react-icons/lu";

import { ROUTES } from "@/app/_libs/constants/routes";
import { cn } from "@/app/_libs/utils/cn";
import { ActivityLogCard } from "@/app/admin/_components/activity-log-card";
import { NeedsAttentionPanel } from "@/app/admin/_components/needs-attention-panel";
import { RecentBusinessesCard } from "@/app/admin/_components/recent-businesses-card";
import { SignupTrendCard } from "@/app/admin/_components/signup-trend-card";
import { LoadErrorState } from "@/components/common/load-error-state";
import { TrendIndicator } from "@/components/common/trend-indicator";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminOverview } from "@/hooks/admin/use-admin-overview";
import { useCountUp } from "@/hooks/common/use-count-up";

export function AdminOverviewView() {
  const t = useTranslations("adminOverview");
  const format = useFormatter();
  const {
    businessCount,
    userCount,
    totalReviewsFetched,
    totalRepliesSent,
    recentBusinesses,
    needsAttention,
    signupTrend,
    activityFeed,
    isLoading,
    isError,
    refetch,
  } = useAdminOverview();

  const showNeedsAttention = needsAttention.length > 0;

  const businessCountAnimated = useCountUp(businessCount, isLoading);
  const userCountAnimated = useCountUp(userCount, isLoading);
  const reviewsFetchedAnimated = useCountUp(totalReviewsFetched, isLoading);
  const repliesSentAnimated = useCountUp(totalRepliesSent, isLoading);

  // Only Businesses has prior-period data; the others stay plain rather than fabricate a delta.
  // `businessCount` is a running total and each bucket is one month's new signups, so the badge
  // shows the latest month's count, not a change in signup rate. Rendered `tone="neutral"`: it can
  // never read as "declining", and green would assert a judgment the data can't back.
  const lastMonth = signupTrend[signupTrend.length - 1];
  const businessTrend = lastMonth ? lastMonth.count : null;

  const stats = [
    {
      key: "businesses",
      value: format.number(businessCountAnimated),
      icon: LuBuilding2,
      trend: businessTrend,
    },
    { key: "users", value: format.number(userCountAnimated), icon: LuUsers, trend: null },
    {
      key: "reviewsFetched",
      value: format.number(reviewsFetchedAnimated),
      icon: LuMessageSquare,
      trend: null,
    },
    { key: "repliesSent", value: format.number(repliesSentAnimated), icon: LuReply, trend: null },
  ] as const;

  // Whole page, not per panel: every panel derives from the same four queries, and a failure
  // would otherwise show confident zeroes, an outage described as good news.
  if (isError) {
    return <LoadErrorState onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
          : stats.map((stat, index) => (
              <Card
                key={stat.key}
                className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500 ease-fluid"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <CardContent className="flex items-center gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                    <stat.icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t(`stats.${stat.key}`)}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
                      {stat.trend !== null && (
                        <TrendIndicator
                          delta={stat.trend}
                          label={t("stats.trendVsLastMonth")}
                          tone="neutral"
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className={cn("grid gap-4", showNeedsAttention && "lg:grid-cols-2")}>
          {showNeedsAttention && <NeedsAttentionPanel businesses={needsAttention} />}
          <RecentBusinessesCard businesses={recentBusinesses} />
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <SignupTrendCard trend={signupTrend} />
          <ActivityLogCard
            entries={activityFeed}
            viewAllHref={`${ROUTES.ADMIN_ACTIVITY}?tab=platformActivity` as Route}
          />
        </div>
      )}
    </div>
  );
}
