import type { ComponentType } from "react";

import { cn } from "@/app/_libs/utils/cn";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Omit for a genuinely empty list with nothing to undo. */
  action?: { label: string; onClick: () => void };
  className?: string;
}

/** For a query that succeeded with nothing to show; `LoadErrorState` is for failures, which must not read as empty. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
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
