import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";


import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { RatingDistributionRow } from "@/types/domain";

interface RatingDistributionCardProps {
  rows: RatingDistributionRow[];
}

export function RatingDistributionCard({ rows }: RatingDistributionCardProps) {
  const t = useTranslations("dashboard.ratingDistribution");
  // Bars start at 0 and grow to their real width once mounted, rather than rendering at
  // final size immediately — makes the distribution feel like it's visualizing itself.
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.star} className="flex items-center gap-3">
            <span className="text-muted-foreground w-14 shrink-0 text-sm">
              {t("starLabel", { star: row.star })}
            </span>
            <div className="bg-secondary h-2 flex-1 overflow-hidden rounded-full">
              <div
                className="bg-primary ease-fluid h-full rounded-full transition-[width] duration-700"
                style={{ width: hasMounted ? `${row.percentage}%` : "0%" }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-sm">{row.count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
