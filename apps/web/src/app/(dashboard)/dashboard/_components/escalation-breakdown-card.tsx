import { useTranslations } from "next-intl";
import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EscalationBreakdownRow, EscalationReason } from "@/types/domain";

interface EscalationBreakdownCardProps {
  rows: EscalationBreakdownRow[];
}

const BAR_CLASSNAME: Record<EscalationReason, string> = {
  low_rating: "bg-warning",
  blocklist_match: "bg-destructive",
};

export function EscalationBreakdownCard({ rows }: EscalationBreakdownCardProps) {
  const t = useTranslations("dashboard.escalationBreakdown");
  const tReason = useTranslations("common.escalationReasonShort");
  // Bars start at 0 and grow to their real width once mounted, matching the other breakdown cards.
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
          <div key={row.reason} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">{tReason(row.reason)}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-fluid ${BAR_CLASSNAME[row.reason]}`}
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
