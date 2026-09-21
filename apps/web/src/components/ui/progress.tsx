"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as React from "react";

import { cn } from "@/app/_libs/utils/cn";

interface ProgressProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  /**
   * Renders a looping sweep instead of a filled bar, for work whose total is genuinely unknown.
   *
   * Needed because a real backfill only gets a denominator if the provider reports one — and
   * `value={0}` for "we don't know" is a lie the user reads as "nothing has happened", while a
   * synthesized percentage is a lie they read as progress. Radix already models this: omitting
   * `value` sets `data-state="indeterminate"` and `aria-valuenow` is dropped, so screen readers
   * announce an indeterminate progressbar rather than 0%.
   */
  indeterminate?: boolean;
}

function Progress({ className, value, indeterminate = false, ...props }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("bg-primary/20 relative h-2 w-full overflow-hidden rounded-full", className)}
      // Explicitly null, not undefined: Radix treats `null` as "indeterminate" and `undefined` as
      // "not provided", and only the former produces the right ARIA state.
      value={indeterminate ? null : value}
      {...props}>
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "bg-primary h-full flex-1 transition-all",
          indeterminate ? "w-1/3 animate-progress-sweep" : "w-full",
        )}
        style={indeterminate ? undefined : { transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
