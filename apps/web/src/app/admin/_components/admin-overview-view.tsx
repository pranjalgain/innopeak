"use client";

import { useFormatter, useTranslations } from "next-intl";
import { LuBuilding2, LuMessageSquare, LuReply, LuUsers } from "react-icons/lu";

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

  // Each stat counts up from 0 on first load, once its real value arrives.
  const businessCountAnimated = useCountUp(businessCount, isLoading);
  const userCountAnimated = useCountUp(userCount, isLoading);
  const reviewsFetchedAnimated = useCountUp(totalReviewsFetched, isLoading);
  const repliesSentAnimated = useCountUp(totalRepliesSent, isLoading);

  // Only Businesses has real historical data to compute a genuine change from — the signup-trend
  // series already fetched for the chart below. The other three stats have no prior-period value
  // anywhere, so they stay plain rather than fabricating a delta that isn't real.
  //
  // `businessCount` above is a running total, and each `signupTrend` bucket is new signups within
  // that one calendar month (a flow, not a cumulative count) — so the trend badge reads however
  // many new businesses joined in the most recent month, not the difference between two months'
  // signup rates (that would answer "is growth accelerating", a different question than what "vs
  // last month" promises next to a running total). Rendered with `tone="neutral"` below: this is a
  // magnitude, not a two-period comparison, and can never legitimately read as "declining" (a
  // month can only add 0 or more businesses) — coloring it green would assert a judgment ("growth
  // is good") the data can't back up, since a low-but-positive count right after a much higher one
  // is really a slowdown, not an improvement.
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

  // The whole page rather than per-panel: every panel here is derived from the same four queries,
  // so a failure would otherwise paint four separate confident zeroes — "0 Businesses", "Nothing
  // needs attention right now", "No signups yet" — which is an outage described as good news.
  if (isError) {
    return (
      <div className="p-fluid-page">
        <LoadErrorState onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-fluid-page">
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
        <div className={`grid gap-4 ${showNeedsAttention ? "lg:grid-cols-2" : ""}`}>
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
          <ActivityLogCard entries={activityFeed} />
        </div>
      )}
    </div>
  );
}
