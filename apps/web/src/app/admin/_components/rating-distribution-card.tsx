import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { LuStar } from "react-icons/lu";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RatingDistributionPoint } from "@/types/domain";

interface RatingDistributionCardProps {
  /** Backend zero-fills all five ratings, ascending. */
  distribution: RatingDistributionPoint[];
}

/** Reversed for display only, so 5 stars is on top. */
export function RatingDistributionCard({ distribution }: RatingDistributionCardProps) {
  const t = useTranslations("adminStatistics.ratingDistribution");
  const format = useFormatter();

  const maxCount = Math.max(1, ...distribution.map((point) => point.count));
  const hasAnyRatings = distribution.some((point) => point.count > 0);
  const descending = [...distribution].sort((a, b) => b.rating - a.rating);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center gap-2.5">
        {!hasAnyRatings ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          descending.map((point, index) => (
            <div key={point.rating} className="flex items-center gap-3">
              <span className="flex w-10 shrink-0 items-center gap-0.5 text-sm font-medium tabular-nums">
                {point.rating}
                <LuStar className="size-3.5 fill-current text-muted-foreground" />
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: `${(point.count / maxCount) * 100}%` }}
                  transition={{ duration: 0.6, delay: index * 0.05, ease: "easeOut" }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                {format.number(point.count)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
