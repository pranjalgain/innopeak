"use client";


import { useTranslations } from "next-intl";
import { useState } from "react";
import { LuClock, LuList, LuStar, LuTriangleAlert } from "react-icons/lu";


import { AttentionReviewsGrid } from "@/app/(dashboard)/dashboard/_components/attention-reviews-grid";
import { BusinessProfileCard } from "@/app/(dashboard)/dashboard/_components/business-profile-card";
import { RatingDistributionCard } from "@/app/(dashboard)/dashboard/_components/rating-distribution-card";
import { StatCard } from "@/app/(dashboard)/dashboard/_components/stat-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardStats } from "@/hooks/dashboard/use-dashboard-stats";
import { useTenant } from "@/hooks/tenant/use-tenant";
import type { DateRange } from "@/types/domain";

const DATE_RANGE_VALUES: DateRange[] = ["7d", "30d", "90d"];

export function DashboardView() {
  const t = useTranslations("dashboard");
  const [range, setRange] = useState<DateRange>("30d");
  const { data: tenant } = useTenant();
  const { stats, ratingDistribution, attentionReviews, isLoading, error } =
    useDashboardStats(range);

  const statCards = [
    {
      id: "reviews",
      label: t("stats.reviews"),
      value: isLoading || !stats ? "—" : String(stats.reviewCount),
      icon: LuList,
    },
    {
      id: "averageRating",
      label: t("stats.averageRating"),
      value: isLoading || !stats ? "—" : `${stats.averageRating.toFixed(1)} ★`,
      icon: LuStar,
    },
    {
      id: "pendingApproval",
      label: t("stats.pendingApproval"),
      value: isLoading || !stats ? "—" : String(stats.pendingApproval),
      icon: LuClock,
    },
    {
      id: "escalatedOpen",
      label: t("stats.escalatedOpen"),
      value: isLoading || !stats ? "—" : String(stats.escalatedOpen),
      icon: LuTriangleAlert,
      warning: true,
    },
  ];

  return (
    <div className="p-fluid-page flex flex-col gap-6">
      {tenant ? <p className="text-muted-foreground text-sm">{tenant.name}</p> : null}

      {tenant ? <BusinessProfileCard tenant={tenant} /> : null}

      <Tabs value={range} onValueChange={(value) => setRange(value as DateRange)}>
        <TabsList className="w-full justify-start overflow-x-auto px-1 sm:w-fit [&>[data-slot=tabs-trigger]]:flex-none">
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
          {t("loadError")}
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
