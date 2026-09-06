import type { ComponentType } from "react";

import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  warning?: boolean;
}

export function StatCard({ label, value, icon: Icon, warning = false }: StatCardProps) {
  return (
    <Card className="h-full gap-3 py-4">
      <CardContent className="flex h-full flex-col gap-3 px-4">
        <div
          className={
            warning
              ? "flex size-8 items-center justify-center rounded-full bg-warning-soft text-warning"
              : "flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground"
          }
        >
          <Icon size={16} />
        </div>
        <div className="mt-auto">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
