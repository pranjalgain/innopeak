"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import { type ComponentProps } from "react";

import { cn } from "@/app/_libs/utils/cn";

interface ProgressProps extends ComponentProps<typeof ProgressPrimitive.Root> {
  /** Looping sweep for work with an unknown total; omitting `value` makes Radix announce an indeterminate progressbar rather than 0%. */
  indeterminate?: boolean;
}

function Progress({ className, value, indeterminate = false, ...props }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("bg-primary/20 relative h-2 w-full overflow-hidden rounded-full", className)}
      // Explicitly null: Radix treats `null` as indeterminate but `undefined` as "not provided".
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
