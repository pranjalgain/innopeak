"use client";

import { useFormatter, useTranslations } from "next-intl";
import { LuGauge, LuReply, LuStar } from "react-icons/lu";

import { ClassificationBreakdownCard } from "@/app/admin/_components/classification-breakdown-card";
import { ConnectionHealthCard } from "@/app/admin/_components/connection-health-card";
import { RatingDistributionCard } from "@/app/admin/_components/rating-distribution-card";
import { ReviewsTrendCard } from "@/app/admin/_components/reviews-trend-card";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminStatistics } from "@/hooks/admin/use-admin-statistics";
import { useCountUp } from "@/hooks/common/use-count-up";

export function AdminStatisticsView() {
  const t = useTranslations("adminStatistics");
  const format = useFormatter();
  const {
    replyRatePercent,
    avgRating,
    syncSuccessRatePercent,
    connectionHealth,
    reviewsTrend,
    ratingDistribution,
    classificationBreakdown,
    isLoading,
    isError,
    refetch,
  } = useAdminStatistics();

  // Each stat counts up from 0 on first load, once its real value arrives — same pattern as
  // Overview's own stat cards (`useCountUp`). Rounded to one decimal before animating since these
  // three are percentages/averages, not whole counts.
  const replyRateAnimated = useCountUp(Math.round(replyRatePercent * 10), isLoading) / 10;
  const avgRatingAnimated = useCountUp(Math.round(avgRating * 10), isLoading) / 10;
  const syncSuccessAnimated = useCountUp(Math.round(syncSuccessRatePercent * 10), isLoading) / 10;

  const stats = [
    {
      key: "replyRate",
      value: format.number(replyRateAnimated / 100, { style: "percent", maximumFractionDigits: 1 }),
      icon: LuReply,
    },
    { key: "avgRating", value: format.number(avgRatingAnimated, { maximumFractionDigits: 1 }), icon: LuStar },
    {
      key: "syncSuccessRate",
      value: format.number(syncSuccessAnimated / 100, { style: "percent", maximumFractionDigits: 1 }),
      icon: LuGauge,
    },
  ] as const;

  // Same reasoning as `AdminOverviewView`'s own doc comment: every panel here is derived from the
  // one summary query, so a failure would otherwise paint several confident zeroes rather than an
  // outage.
  if (isError) {
    return <LoadErrorState onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
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
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 w-full rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ReviewsTrendCard trend={reviewsTrend} />
          </div>
          <ConnectionHealthCard health={connectionHealth} />
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <RatingDistributionCard distribution={ratingDistribution} />
          <ClassificationBreakdownCard breakdown={classificationBreakdown} />
        </div>
      )}
    </div>
  );
}
