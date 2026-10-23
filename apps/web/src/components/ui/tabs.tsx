"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import { type ComponentProps, createContext, useContext, useEffect, useId, useRef, useState } from "react";


import { cn } from "@/app/_libs/utils/cn";

/** Tracks the active tab in JS (Radix exposes it only as `data-state`) for the sliding indicator, plus a per-`Tabs` id so instances don't share one `layoutId`. */
interface TabsIndicatorContextValue {
  activeValue: string | undefined;
  indicatorId: string;
}

const TabsIndicatorContext = createContext<TabsIndicatorContextValue | null>(null);

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: ComponentProps<typeof TabsPrimitive.Root>) {
  const indicatorId = useId();
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
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

function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
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
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const context = useContext(TabsIndicatorContext);
  const isActive = context?.activeValue === value;
  const triggerRef = useRef<HTMLButtonElement>(null);

  // A strip wider than its box (eight tabs on a phone) scrolls sideways: bring the active tab into view, so a `?tab=` deep link or a
  // keyboard move does not leave it off-screen. `nearest` on both axes never scrolls the page itself, only the strip.
  useEffect(() => {
    if (isActive) triggerRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [isActive]);

  return (
    <TabsPrimitive.Trigger
      ref={triggerRef}
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
          // `dark:bg-input/30` read as almost black (~0.03 lightness bump) and `shadow-sm` barely registers on
          // dark surfaces; a light `primary` tint matches other "selected" states without looking like a CTA.
          className="border-border dark:border-primary/40 absolute inset-0 z-0 rounded-md border bg-card shadow-sm dark:bg-primary/25"
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
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
