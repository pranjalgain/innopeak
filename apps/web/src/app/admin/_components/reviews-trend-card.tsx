import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReviewsTrendPoint } from "@/types/domain";

interface ReviewsTrendCardProps {
  /** Already bucketed by calendar month and zero-filled by the backend (`GET
   *  .../statistics/summary`) — oldest first, `monthKey` as `YYYY-MM`. */
  trend: ReviewsTrendPoint[];
}

interface MonthBucket {
  key: string;
  date: Date;
  reviewsFetched: number;
  repliesSent: number;
}

/** Same UTC-parsing reasoning as `SignupTrendCard.toMonthBuckets` — the backend already did the
 *  actual bucketing and zero-filling, this is presentation-only. */
function toMonthBuckets(trend: ReviewsTrendPoint[]): MonthBucket[] {
  return trend.map((point) => {
    const [year, month] = point.monthKey.split("-").map(Number);
    return {
      key: point.monthKey,
      date: new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)),
      reviewsFetched: point.reviewsFetched,
      repliesSent: point.repliesSent,
    };
  });
}

/** Two-series version of `SignupTrendCard`'s hand-rolled bar chart — reviews fetched (solid) next
 *  to replies sent (a lighter, offset bar) per month, with its own small legend since a two-series
 *  chart (unlike Signups' single series) needs one to say what each bar color means. */
export function ReviewsTrendCard({ trend }: ReviewsTrendCardProps) {
  const t = useTranslations("adminStatistics.reviewsTrend");
  const format = useFormatter();

  const months = toMonthBuckets(trend);
  const maxCount = Math.max(1, ...months.map((month) => Math.max(month.reviewsFetched, month.repliesSent)));
  // Both series, not just fetches: the two are bucketed independently (fetches by
  // `reviews.created_at`, replies by `review_responses.posted_at`), so a window can legitimately
  // carry replies with no new fetches at all — syncing stalled platform-wide while staff kept
  // working the backlog. Checking only fetches claimed "nothing to show" and hid the replies.
  const hasAnyActivity = months.some(
    (month) => month.reviewsFetched > 0 || month.repliesSent > 0,
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary" />
              {t("legendFetched")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary/35" />
              {t("legendReplied")}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!hasAnyActivity ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="flex min-h-36 flex-1 items-end gap-2.5">
            {months.map((month, index) => (
              <div key={month.key} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-medium tabular-nums">{month.reviewsFetched}</span>
                <div className="flex w-full flex-1 items-end gap-1">
                  <motion.div
                    className="w-full rounded-t-md bg-primary"
                    initial={{ height: "0%" }}
                    animate={{ height: `${(month.reviewsFetched / maxCount) * 100}%` }}
                    transition={{ duration: 0.6, delay: index * 0.05, ease: "easeOut" }}
                  />
                  <motion.div
                    className="w-full rounded-t-md bg-primary/35"
                    initial={{ height: "0%" }}
                    animate={{ height: `${(month.repliesSent / maxCount) * 100}%` }}
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
