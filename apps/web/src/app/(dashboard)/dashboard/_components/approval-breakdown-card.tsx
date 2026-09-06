import { useTranslations } from "next-intl";
import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApprovalBreakdownRow, ApprovalOutcome } from "@/types/domain";

interface ApprovalBreakdownCardProps {
  rows: ApprovalBreakdownRow[];
}

const BAR_CLASSNAME: Record<ApprovalOutcome, string> = {
  approved_as_is: "bg-success",
  approved_edited: "bg-primary",
  rejected: "bg-destructive",
};

export function ApprovalBreakdownCard({ rows }: ApprovalBreakdownCardProps) {
  const t = useTranslations("dashboard.approvalBreakdown");
  // Bars start at 0 and grow to their real width once mounted, matching RatingDistributionCard.
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
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
          <div key={row.outcome} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">{t(`outcomes.${row.outcome}`)}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-fluid ${BAR_CLASSNAME[row.outcome]}`}
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
