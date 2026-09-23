"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import * as React from "react";


import { cn } from "@/app/_libs/utils/cn";

/** Tracks the active tab value in JS (Radix only exposes it as a `data-state` DOM attribute) so
 *  `TabsTrigger` knows whether to render the sliding indicator, and a per-`Tabs` id so multiple
 *  `Tabs` instances on the same page never share (and fight over) one `layoutId`. */
interface TabsIndicatorContextValue {
  activeValue: string | undefined;
  indicatorId: string;
}

const TabsIndicatorContext = React.createContext<TabsIndicatorContextValue | null>(null);

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const indicatorId = React.useId();
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const activeValue = value ?? uncontrolledValue;

  return (
    <TabsIndicatorContext.Provider value={{ activeValue, indicatorId }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn("flex flex-col gap-2", className)}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          setUncontrolledValue(next);
          onValueChange?.(next);
        }}
        {...props}
      />
    </TabsIndicatorContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const context = React.useContext(TabsIndicatorContext);
  const isActive = context?.activeValue === value;

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-muted-foreground data-[state=active]:text-foreground dark:text-muted-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-colors ease-fluid focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {isActive && (
        <motion.div
          layoutId={context ? `tabs-active-bg-${context.indicatorId}` : undefined}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          // `dark:bg-input/30` (the original static-background value this replaced) read as
          // almost black: `--input` composited at 30% opacity over `TabsList`'s own `bg-muted`
          // works out to only a ~0.03 lightness bump — invisible enough that switching tabs looked
          // like nothing happened. `shadow-sm` is what actually sells "raised card" in light mode
          // (shadows barely register on a dark surface), so dark mode needs a real background jump
          // instead of leaning on it. A plain neutral fill (`dark:bg-input` at full strength) fixed
          // the contrast but still read as flat; a light `primary` tint (the same hue already used
          // for other "selected" states — the sidebar's active indicator, a selected toggle) gives
          // the same visibility with a color cue tying it to that convention, without going full
          // solid `primary`, which would misread as a call-to-action rather than a neutral tab.
          className="border-border dark:border-primary/40 absolute inset-0 z-0 rounded-md border bg-card shadow-sm dark:bg-primary/25"
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 flex-1 outline-none duration-300 ease-fluid motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
