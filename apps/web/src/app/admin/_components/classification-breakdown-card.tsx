import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClassificationBreakdownPoint, ReviewClassification } from "@/types/domain";

interface ClassificationBreakdownCardProps {
  /** All three classifications always present, zero-filled where unused — backend already did
   *  this (`GET .../statistics/summary`), so this only renders it. */
  breakdown: ClassificationBreakdownPoint[];
}

// `Partial`, not `Record`: `ReviewClassification` is the review-queue's own broader type (which
// also has `unclassified`, a filter-only value that never comes from this endpoint) — the backend
// response here is only ever one of these three, but TypeScript can't narrow that from the shared
// type alone.
const DOT_CLASSNAME: Partial<Record<ReviewClassification, string>> = {
  auto_reply_candidate: "bg-success",
  escalated: "bg-destructive",
  pending_classification: "bg-muted-foreground",
};
const DEFAULT_DOT_CLASSNAME = "bg-muted-foreground";

export function ClassificationBreakdownCard({ breakdown }: ClassificationBreakdownCardProps) {
  const t = useTranslations("adminStatistics.classificationBreakdown");
  const format = useFormatter();

  const total = breakdown.reduce((sum, point) => sum + point.count, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center gap-2">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          breakdown.map((point) => {
            const share = total === 0 ? 0 : (point.count / total) * 100;
            return (
              <div key={point.classification} className="flex items-center justify-between gap-3 py-1">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      DOT_CLASSNAME[point.classification] ?? DEFAULT_DOT_CLASSNAME,
                    )}
                  />
                  <span className="truncate">{t(`classifications.${point.classification}`)}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {format.number(point.count)} · {format.number(share / 100, { style: "percent", maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
