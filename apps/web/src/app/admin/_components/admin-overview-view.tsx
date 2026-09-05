"use client";

import { useTranslations } from "next-intl";
import { LuBuilding2, LuCreditCard, LuMessageSquare, LuReply, LuUsers } from "react-icons/lu";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminOverview } from "@/hooks/admin/use-admin-overview";
import { useCountUp } from "@/hooks/common/use-count-up";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

export function AdminOverviewView() {
  const t = useTranslations("adminOverview");
  const { businessCount, userCount, mrr, totalReviewsFetched, totalRepliesSent, isLoading } = useAdminOverview();

  // Each stat counts up from 0 on first load, once its real value arrives.
  const businessCountAnimated = useCountUp(businessCount, isLoading);
  const userCountAnimated = useCountUp(userCount, isLoading);
  const mrrAnimated = useCountUp(mrr, isLoading);
  const reviewsFetchedAnimated = useCountUp(totalReviewsFetched, isLoading);
  const repliesSentAnimated = useCountUp(totalRepliesSent, isLoading);

  const stats = [
    { key: "businesses", value: NUMBER_FORMATTER.format(businessCountAnimated), icon: LuBuilding2 },
    { key: "users", value: NUMBER_FORMATTER.format(userCountAnimated), icon: LuUsers },
    { key: "mrr", value: CURRENCY_FORMATTER.format(mrrAnimated), icon: LuCreditCard },
    { key: "reviewsFetched", value: NUMBER_FORMATTER.format(reviewsFetchedAnimated), icon: LuMessageSquare },
    { key: "repliesSent", value: NUMBER_FORMATTER.format(repliesSentAnimated), icon: LuReply },
  ] as const;

  return (
    <div className="flex flex-col gap-6 p-fluid-page">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {isLoading
          ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
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
    </div>
  );
}
