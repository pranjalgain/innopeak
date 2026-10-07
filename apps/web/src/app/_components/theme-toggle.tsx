"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { LuMoon, LuSun } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";

/**
 * Always-visible binary light/dark switch, for the same reason as `LanguageSwitcher`. No OS-preference inference:
 * `ThemeProvider` sets `defaultTheme="light"` and `enableSystem={false}`, so `resolvedTheme` is always "light" or "dark".
 * Uses `@radix-ui/react-switch` directly because the icon content doesn't fit `Switch`. `compact` mirrors
 * `LanguageSwitcher`'s prop so both fit the marketing header.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean } = {}) {
  const t = useTranslations("themeToggle");
  const { resolvedTheme, setTheme } = useTheme();
  // `resolvedTheme` is `undefined` on the server and first client render (next-themes reads `localStorage`). Rendering the
  // real switch then would paint it in the light position for a dark visitor and slide it a frame later on every load.
  // Until `mounted`, render a non-interactive twin positioned by `dark:` variants, which key off the pre-paint `.dark`
  // class; the real switch then takes over at the same position.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <ThemeTogglePlaceholder compact={compact} />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <SwitchPrimitive.Root
      checked={isDark}
      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      // Names the thing toggled, not the action: Radix emits `role="switch"` + `aria-checked`, so "Switch to light mode"
      // would be announced as on, the opposite of the state.
      aria-label={t("label")}
      className={cn(
        "focus-visible:ring-ring/50 relative inline-flex shrink-0 items-center rounded-full",
        compact ? "h-7 w-12" : "h-8 w-14",
        "border-border bg-accent border transition-colors duration-300 ease-fluid outline-none focus-visible:ring-[3px]",
        "motion-reduce:transition-none",
      )}>
      <SwitchPrimitive.Thumb
        className={cn(
          "border-border bg-card shadow-elevated relative flex items-center justify-center rounded-full border",
          compact ? "size-5" : "size-6",
          "translate-x-1 transition-transform duration-300 ease-fluid",
          compact ? "data-[state=checked]:translate-x-6" : "data-[state=checked]:translate-x-7",
          "motion-reduce:transition-none",
        )}>
        <LuSun
          aria-hidden="true"
          className={cn(
            "text-warning absolute size-3.5 backface-hidden transition-all duration-300 ease-fluid",
            "motion-reduce:transition-none",
            isDark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
          )}
        />
        <LuMoon
          aria-hidden="true"
          className={cn(
            "text-primary absolute size-3.5 backface-hidden transition-all duration-300 ease-fluid",
            "motion-reduce:transition-none",
            isDark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0",
          )}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}

/** Pre-hydration stand-in for `ThemeToggle`, driven by `dark:` variants rather than React state. `aria-hidden` because it
 *  can't be operated; no transitions, so the real switch mounting in the same spot doesn't look like movement. */
function ThemeTogglePlaceholder({ compact }: { compact: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full",
        compact ? "h-7 w-12" : "h-8 w-14",
        "border-border bg-accent border",
      )}>
      <div
        className={cn(
          "border-border bg-card shadow-elevated relative flex items-center justify-center rounded-full border",
          compact ? "size-5" : "size-6",
          compact ? "translate-x-1 dark:translate-x-6" : "translate-x-1 dark:translate-x-7",
        )}>
        <LuSun className="text-warning absolute size-3.5 dark:hidden" />
        <LuMoon className="text-primary absolute hidden size-3.5 dark:block" />
      </div>
    </div>
  );
}
