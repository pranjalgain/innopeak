import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { UpgradeTrendPoint } from "@/types/domain";

interface UpgradeTrendCardProps {
  /** Already bucketed by calendar month and zero-filled by the backend (`GET
   *  .../billing/summary`) — oldest first, `monthKey` as `YYYY-MM`. */
  trend: UpgradeTrendPoint[];
}

interface MonthBucket {
  key: string;
  date: Date;
  count: number;
}

/** Same UTC-parsing reasoning as `SignupTrendCard.toMonthBuckets`. Kept as its own small component
 *  (rather than reusing `SignupTrendCard` directly) since that one hardcodes the `adminOverview`
 *  translation namespace — this is the Billing page's own chart, on the Billing page's own copy. */
function toMonthBuckets(trend: UpgradeTrendPoint[]): MonthBucket[] {
  return trend.map((point) => {
    const [year, month] = point.monthKey.split("-").map(Number);
    return {
      key: point.monthKey,
      date: new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)),
      count: point.count,
    };
  });
}

export function UpgradeTrendCard({ trend }: UpgradeTrendCardProps) {
  const t = useTranslations("adminBilling.upgradeTrend");
  const format = useFormatter();

  const months = toMonthBuckets(trend);
  const maxCount = Math.max(1, ...months.map((month) => month.count));
  const hasAnyUpgrades = months.some((month) => month.count > 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!hasAnyUpgrades ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="flex min-h-36 flex-1 items-end gap-2.5">
            {months.map((month, index) => (
              <div key={month.key} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-medium tabular-nums">{month.count}</span>
                <div className="flex w-full flex-1 items-end">
                  <motion.div
                    className={cn(
                      "w-full rounded-t-md",
                      index === months.length - 1 ? "bg-primary" : "bg-primary/35",
                    )}
                    initial={{ height: "0%" }}
                    animate={{ height: `${(month.count / maxCount) * 100}%` }}
                    transition={{ duration: 0.6, delay: index * 0.05, ease: "easeOut" }}
                  />
                </div>
                <span className="text-muted-foreground text-[11px]">
                  {format.dateTime(month.date, { month: "short", timeZone: "UTC" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
