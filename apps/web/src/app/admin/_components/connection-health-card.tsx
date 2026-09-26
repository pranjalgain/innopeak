import { useFormatter, useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionHealth } from "@/types/domain";

interface ConnectionHealthCardProps {
  health: ConnectionHealth;
}

const ROWS: { key: keyof ConnectionHealth; dotClassName: string }[] = [
  { key: "connected", dotClassName: "bg-success" },
  { key: "needsReauth", dotClassName: "bg-warning" },
  { key: "disconnected", dotClassName: "bg-destructive" },
  { key: "neverConnected", dotClassName: "bg-muted-foreground" },
];

export function ConnectionHealthCard({ health }: ConnectionHealthCardProps) {
  const t = useTranslations("adminStatistics.connectionHealth");
  const format = useFormatter();

  const total = health.connected + health.needsReauth + health.disconnected + health.neverConnected;

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
          ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 py-1">
              <span className="flex items-center gap-2 text-sm">
                <span className={`size-2 shrink-0 rounded-full ${row.dotClassName}`} />
                {t(row.key)}
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {format.number(health[row.key])}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
