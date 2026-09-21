"use client";

import { useFormatter, useTranslations } from "next-intl";
import { LuBuilding2, LuMessageSquare, LuReply, LuUsers } from "react-icons/lu";

import { ActivityLogCard } from "@/app/admin/_components/activity-log-card";
import {
  hasBusinessesNeedingAttention,
  NeedsAttentionPanel,
} from "@/app/admin/_components/needs-attention-panel";
import { RecentBusinessesCard } from "@/app/admin/_components/recent-businesses-card";
import { SignupTrendCard } from "@/app/admin/_components/signup-trend-card";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminOverview } from "@/hooks/admin/use-admin-overview";
import { useCountUp } from "@/hooks/common/use-count-up";

export function AdminOverviewView() {
  const t = useTranslations("adminOverview");
  const format = useFormatter();
  const {
    businesses,
    businessCount,
    userCount,
    totalReviewsFetched,
    totalRepliesSent,
    activityFeed,
    isLoading,
    isError,
    refetch,
  } = useAdminOverview();

  const showNeedsAttention = hasBusinessesNeedingAttention(businesses);

  // Each stat counts up from 0 on first load, once its real value arrives.
  const businessCountAnimated = useCountUp(businessCount, isLoading);
  const userCountAnimated = useCountUp(userCount, isLoading);
  const reviewsFetchedAnimated = useCountUp(totalReviewsFetched, isLoading);
  const repliesSentAnimated = useCountUp(totalRepliesSent, isLoading);

  const stats = [
    { key: "businesses", value: format.number(businessCountAnimated), icon: LuBuilding2 },
    { key: "users", value: format.number(userCountAnimated), icon: LuUsers },
    { key: "reviewsFetched", value: format.number(reviewsFetchedAnimated), icon: LuMessageSquare },
    { key: "repliesSent", value: format.number(repliesSentAnimated), icon: LuReply },
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
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums">{stat.value}</p>
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
          {showNeedsAttention && <NeedsAttentionPanel businesses={businesses} />}
          <RecentBusinessesCard businesses={businesses} />
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <SignupTrendCard businesses={businesses} />
          <ActivityLogCard entries={activityFeed} />
        </div>
      )}
    </div>
  );
}
