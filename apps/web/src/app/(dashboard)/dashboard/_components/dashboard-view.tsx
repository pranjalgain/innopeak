"use client";


import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LuClock, LuList, LuStar, LuTriangleAlert } from "react-icons/lu";


import { AttentionReviewsGrid } from "@/app/(dashboard)/dashboard/_components/attention-reviews-grid";
import { BusinessProfileCard } from "@/app/(dashboard)/dashboard/_components/business-profile-card";
import { RatingDistributionCard } from "@/app/(dashboard)/dashboard/_components/rating-distribution-card";
import { StatCard } from "@/app/(dashboard)/dashboard/_components/stat-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCountUp } from "@/hooks/common/use-count-up";
import { useDashboardStats } from "@/hooks/dashboard/use-dashboard-stats";
import { useTenant } from "@/hooks/tenant/use-tenant";
import type { DateRange } from "@/types/domain";

const DATE_RANGE_VALUES: DateRange[] = ["7d", "30d", "90d"];

export function DashboardView() {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const tCommon = useTranslations("common");
  const [range, setRange] = useState<DateRange>("30d");
  const { data: tenant } = useTenant();
  const { stats, ratingDistribution, attentionReviews, isLoading, error, retry } =
    useDashboardStats(range);

  const statsLoading = isLoading || !stats;
  // Counts up from 0 once the value arrives (like the admin overview tiles); the rating is scaled by 10 to animate one decimal.
  const reviewCountAnimated = useCountUp(stats?.reviewCount ?? 0, statsLoading);
  const averageRatingAnimated = useCountUp(Math.round((stats?.averageRating ?? 0) * 10), statsLoading);
  const pendingApprovalAnimated = useCountUp(stats?.pendingApproval ?? 0, statsLoading);
  const escalatedOpenAnimated = useCountUp(stats?.escalatedOpen ?? 0, statsLoading);

  const statCards = [
    {
      id: "reviews",
      label: t("stats.reviews"),
      value: statsLoading ? "—" : format.number(reviewCountAnimated),
      icon: LuList,
    },
    {
      id: "averageRating",
      label: t("stats.averageRating"),
      value: statsLoading ? "—" : `${format.number(averageRatingAnimated / 10, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★`,
      icon: LuStar,
    },
    {
      id: "pendingApproval",
      label: t("stats.pendingApproval"),
      value: statsLoading ? "—" : format.number(pendingApprovalAnimated),
      icon: LuClock,
    },
    {
      id: "escalatedOpen",
      label: t("stats.escalatedOpen"),
      value: statsLoading ? "—" : format.number(escalatedOpenAnimated),
      icon: LuTriangleAlert,
      warning: true,
    },
  ];

  return (
    <div className="p-fluid-page flex flex-col gap-6">
      {tenant ? <p className="text-muted-foreground text-sm">{tenant.name}</p> : null}

      {tenant ? <BusinessProfileCard tenant={tenant} /> : null}

      <Tabs value={range} onValueChange={(value) => setRange(value as DateRange)}>
        <TabsList className="w-full justify-start overflow-x-auto scrollbar-hide px-1 sm:w-fit sm:max-w-full [&>[data-slot=tabs-trigger]]:flex-none">
          {DATE_RANGE_VALUES.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`dateRanges.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error ? (
        <div
          role="alert"
          className="animate-in fade-in zoom-in-95 bg-destructive-soft text-destructive ease-fluid flex items-center gap-3 rounded-lg px-4 py-3 text-sm duration-300">
          <LuTriangleAlert className="shrink-0" />
          <span className="flex-1">{t("loadError")}</span>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            {tCommon("loadError.retry")}
          </Button>
        </div>
      ) : null}

      <div className="gap-fluid grid grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, index) => (
          <div
            key={card.id}
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid duration-500"
            style={{ animationDelay: `${index * 60}ms` }}>
            <StatCard
              label={card.label}
              value={card.value}
              icon={card.icon}
              warning={card.warning}
            />
          </div>
        ))}
      </div>

      <RatingDistributionCard rows={ratingDistribution} />

      <AttentionReviewsGrid reviews={attentionReviews} />
    </div>
  );
}
