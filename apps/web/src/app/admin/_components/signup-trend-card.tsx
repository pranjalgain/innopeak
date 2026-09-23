import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SignupTrendPoint } from "@/types/domain";

interface SignupTrendCardProps {
  /** Already bucketed by calendar month and zero-filled by the backend (`GET
   *  .../overview/signup-trend`) — oldest first, `monthKey` as `YYYY-MM`. */
  trend: SignupTrendPoint[];
}

interface MonthBucket {
  key: string;
  date: Date;
  count: number;
}

/**
 * Parses each `YYYY-MM` `monthKey` into a UTC `Date` for `format.dateTime` to render — the
 * backend already did the actual bucketing (and the zero-filling), so this is presentation-only.
 * UTC, not the viewer's timezone, so a signup at `2026-02-01T00:30:00Z` reads as February for
 * every admin regardless of which timezone they're in.
 */
function toMonthBuckets(trend: SignupTrendPoint[]): MonthBucket[] {
  return trend.map((point) => {
    const [year, month] = point.monthKey.split("-").map(Number);
    return {
      key: point.monthKey,
      date: new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)),
      count: point.count,
    };
  });
}

export function SignupTrendCard({ trend }: SignupTrendCardProps) {
  const t = useTranslations("adminOverview.signupTrend");
  const format = useFormatter();

  const months = toMonthBuckets(trend);
  const maxCount = Math.max(1, ...months.map((month) => month.count));
  // The window is always full, so `months.length` can no longer stand in for "nothing to show".
  const hasAnySignups = months.some((month) => month.count > 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!hasAnySignups ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="flex min-h-36 flex-1 items-end gap-2.5">
            {months.map((month, index) => (
              <div key={month.key} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-medium tabular-nums">{month.count}</span>
                <div className="flex w-full flex-1 items-end">
                  <motion.div
                    className={`w-full rounded-t-md ${
                      index === months.length - 1 ? "bg-primary" : "bg-primary/35"
                    }`}
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
