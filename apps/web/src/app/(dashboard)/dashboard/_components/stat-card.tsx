import type { ComponentType } from "react";

import { cn } from "@/app/_libs/utils/cn";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  warning?: boolean;
}

export function StatCard({ label, value, icon: Icon, warning = false }: StatCardProps) {
  return (
    <Card className={cn("h-full gap-3 py-4", warning && "border-warning")}>
      <CardContent className="flex h-full flex-col gap-3 px-4">
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-full",
            // The pulse stays on the small icon badge, not the whole card — a pulsing card in a
            // 4-up grid is distracting; the badge is enough to draw the eye.
            warning
              ? "animate-pulse bg-warning-soft text-warning"
              : "bg-accent text-accent-foreground",
          )}
        >
          <Icon size={16} />
        </div>
        <div className="mt-auto">
          <p className="text-sm text-muted-foreground">{label}</p>
          {/* `font-semibold`/`tabular-nums` to match the admin overview's own stat tiles
              (`admin-overview-view.tsx`) — this app's one other stat-number pattern — and to keep
              a changing figure from jittering the label's baseline as its digit widths vary. */}
          <p className={cn("text-2xl font-semibold tabular-nums", warning && "text-warning")}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
