"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { LuClock, LuList, LuStar, LuTimer, LuTriangleAlert } from "react-icons/lu";

import { ApprovalBreakdownCard } from "@/app/(dashboard)/dashboard/_components/approval-breakdown-card";
import { AttentionReviewsGrid } from "@/app/(dashboard)/dashboard/_components/attention-reviews-grid";
import { BusinessProfileCard } from "@/app/(dashboard)/dashboard/_components/business-profile-card";
import { EscalationBreakdownCard } from "@/app/(dashboard)/dashboard/_components/escalation-breakdown-card";
import { RatingDistributionCard } from "@/app/(dashboard)/dashboard/_components/rating-distribution-card";
import { StatCard } from "@/app/(dashboard)/dashboard/_components/stat-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardStats } from "@/hooks/dashboard/use-dashboard-stats";
import { useTenant } from "@/hooks/tenant/use-tenant";
import type { DateRange } from "@/types/domain";

const DATE_RANGE_VALUES: DateRange[] = ["7d", "30d", "90d"];

/** e.g. 38 -> "38m", 90 -> "1h 30m", 120 -> "2h". */
function formatApprovalTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function DashboardView() {
  const t = useTranslations("dashboard");
  const [range, setRange] = React.useState<DateRange>("30d");
  const { data: tenant } = useTenant();
  const { stats, ratingDistribution, attentionReviews, approvalBreakdown, escalationBreakdown, isLoading } =
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
    {
      id: "medianApprovalTime",
      label: t("stats.medianApprovalTime"),
      value:
        isLoading || !stats || stats.medianApprovalTimeMinutes === null
          ? "—"
          : formatApprovalTime(stats.medianApprovalTimeMinutes),
      icon: LuTimer,
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-fluid-page">
      {tenant ? <p className="text-sm text-muted-foreground">{tenant.name}</p> : null}

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

      <div className="grid grid-cols-2 gap-fluid lg:grid-cols-5">
        {statCards.map((card, index) => (
          <div
            key={card.id}
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500 ease-fluid"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <StatCard label={card.label} value={card.value} icon={card.icon} warning={card.warning} />
          </div>
        ))}
      </div>

      <div className="grid gap-fluid lg:grid-cols-2 xl:grid-cols-3">
        <RatingDistributionCard rows={ratingDistribution} />
        <ApprovalBreakdownCard rows={approvalBreakdown} />
        <EscalationBreakdownCard rows={escalationBreakdown} />
      </div>

      <AttentionReviewsGrid reviews={attentionReviews} />
    </div>
  );
}
