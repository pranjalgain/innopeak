import { useTranslations } from "next-intl";
import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminBusiness } from "@/types/domain";

interface SignupTrendCardProps {
  businesses: AdminBusiness[];
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short" });

interface MonthBucket {
  key: string;
  date: Date;
  count: number;
}

/** Buckets `createdAt` by calendar month — a real derivation from the businesses already loaded, not a separate mock series. */
function bucketByMonth(businesses: AdminBusiness[]): MonthBucket[] {
  const counts = new Map<string, MonthBucket>();

  for (const business of businesses) {
    const created = new Date(business.createdAt);
    const key = `${created.getFullYear()}-${created.getMonth()}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { key, date: new Date(created.getFullYear(), created.getMonth(), 1), count: 1 });
    }
  }

  return [...counts.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function SignupTrendCard({ businesses }: SignupTrendCardProps) {
  const t = useTranslations("adminOverview.signupTrend");
  // Bars grow from 0 once mounted, matching the other breakdown/distribution cards.
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  const months = bucketByMonth(businesses);
  const maxCount = Math.max(1, ...months.map((month) => month.count));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="flex min-h-36 flex-1 items-end gap-2.5">
            {months.map((month) => (
              <div key={month.key} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-medium tabular-nums">{month.count}</span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-primary transition-[height] duration-700 ease-fluid"
                    style={{ height: hasMounted ? `${(month.count / maxCount) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">{MONTH_FORMATTER.format(month.date)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
