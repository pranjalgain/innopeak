import { useFormatter, useTranslations } from "next-intl";
import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminBusiness } from "@/types/domain";

interface SignupTrendCardProps {
  businesses: AdminBusiness[];
}

interface MonthBucket {
  key: string;
  date: Date;
  count: number;
}

/** How many months the chart shows, counting back from the current one. */
const WINDOW_MONTHS = 6;

/**
 * Buckets `createdAt` by calendar month — a real derivation from the businesses already loaded,
 * not a separate mock series.
 *
 * Two things this is careful about:
 *
 *   - **UTC, not the viewer's timezone.** The backend runs on `TZ=UTC` and sends UTC instants, so
 *     `getFullYear()`/`getMonth()` (local) put a tenant created at `2026-02-01T00:30:00Z` in
 *     January for an admin in UTC-5 and February for one in UTC+1 — the same chart disagreeing
 *     with itself depending on who opened it. `getUTC*` makes the buckets match what the database
 *     would say.
 *   - **Every month in the window, including the empty ones.** Omitting zero-signup months drew
 *     Jan/Mar/Apr as three adjacent equal-width bars, implying an unbroken series and hiding the
 *     gap that was the actual story. A fixed window also caps the bar count, which previously grew
 *     without limit — three years of data rendered 36 slivers.
 */
function bucketByMonth(businesses: AdminBusiness[]): MonthBucket[] {
  const counts = new Map<string, number>();

  for (const business of businesses) {
    const created = new Date(business.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const key = `${created.getUTCFullYear()}-${created.getUTCMonth()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const now = new Date();
  const buckets: MonthBucket[] = [];

  for (let offset = WINDOW_MONTHS - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    buckets.push({ key, date, count: counts.get(key) ?? 0 });
  }

  return buckets;
}

export function SignupTrendCard({ businesses }: SignupTrendCardProps) {
  const t = useTranslations("adminOverview.signupTrend");
  const format = useFormatter();
  // Bars grow from 0 once mounted, matching the other breakdown/distribution cards.
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  const months = bucketByMonth(businesses);
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
            {months.map((month) => (
              <div key={month.key} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-medium tabular-nums">{month.count}</span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="bg-primary ease-fluid w-full rounded-t-md transition-[height] duration-700"
                    style={{ height: hasMounted ? `${(month.count / maxCount) * 100}%` : "0%" }}
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
