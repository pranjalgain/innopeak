"use client";

import { useTranslations } from "next-intl";
import { LuBuilding2, LuMessageSquare, LuReply, LuUsers } from "react-icons/lu";

import { ActivityLogCard } from "@/app/admin/_components/activity-log-card";
import { NeedsAttentionPanel } from "@/app/admin/_components/needs-attention-panel";
import { RecentBusinessesCard } from "@/app/admin/_components/recent-businesses-card";
import { SignupTrendCard } from "@/app/admin/_components/signup-trend-card";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminOverview } from "@/hooks/admin/use-admin-overview";
import { useCountUp } from "@/hooks/common/use-count-up";

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

export function AdminOverviewView() {
  const t = useTranslations("adminOverview");
  const { businesses, businessCount, userCount, totalReviewsFetched, totalRepliesSent, recentActivity, isLoading } =
    useAdminOverview();

  // Each stat counts up from 0 on first load, once its real value arrives.
  const businessCountAnimated = useCountUp(businessCount, isLoading);
  const userCountAnimated = useCountUp(userCount, isLoading);
  const reviewsFetchedAnimated = useCountUp(totalReviewsFetched, isLoading);
  const repliesSentAnimated = useCountUp(totalRepliesSent, isLoading);

  const stats = [
    { key: "businesses", value: NUMBER_FORMATTER.format(businessCountAnimated), icon: LuBuilding2 },
    { key: "users", value: NUMBER_FORMATTER.format(userCountAnimated), icon: LuUsers },
    { key: "reviewsFetched", value: NUMBER_FORMATTER.format(reviewsFetchedAnimated), icon: LuMessageSquare },
    { key: "repliesSent", value: NUMBER_FORMATTER.format(repliesSentAnimated), icon: LuReply },
  ] as const;

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
        <div className="grid gap-4 lg:grid-cols-2">
          <NeedsAttentionPanel businesses={businesses} />
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
          <ActivityLogCard entries={recentActivity} />
        </div>
      )}
    </div>
  );
}
