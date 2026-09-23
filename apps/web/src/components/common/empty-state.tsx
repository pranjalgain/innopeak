import type { ComponentType } from "react";

import { cn } from "@/app/_libs/utils/cn";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** An optional recovery action — e.g. "Clear filters" for a filtered-to-nothing list. Omit for a
   *  genuinely empty list with nothing to undo. */
  action?: { label: string; onClick: () => void };
  className?: string;
}

/**
 * Shown when a query **succeeded** and genuinely has nothing to show — distinct from
 * `LoadErrorState`, which is for a **failed** query. Conflating the two (as every admin hook used
 * to, via `?? []`) makes an outage indistinguishable from an empty platform.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-elevated",
        className,
      )}
    >
      <Icon className="size-7 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-[13px] text-muted-foreground">{description}</p>
      {action ? (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
