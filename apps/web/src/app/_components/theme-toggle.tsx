"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { LuMoon, LuSun } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";

/**
 * Standalone, always-visible theme toggle — same "always in chrome, never nested inside a menu a
 * user has to open first" reasoning as `LanguageSwitcher`. A binary switch, not a Light/Dark/
 * System dropdown (that was this component's first draft — replaced on request for something
 * more direct, then simplified further by dropping "System" entirely): clicking flips between
 * light and dark. No OS-preference inference — `ThemeProvider` in `layout.tsx` sets
 * `defaultTheme="light"` and `enableSystem={false}`, so every visitor starts on light regardless
 * of their OS setting, and `resolvedTheme` here is always plainly `"light"` or `"dark"`.
 *
 * The thumb is a sliding track+circle (`@radix-ui/react-switch`, the same primitive `Switch`
 * wraps, used directly here rather than through that component — this needs custom internal icon
 * content its plain track/thumb doesn't have room for) carrying both icons stacked in the same
 * spot: the outgoing one rotates out and shrinks while the incoming one rotates in and grows, so
 * the swap reads as one continuous turn rather than a hard cut. `prefers-reduced-motion` still
 * gets a plain, instant swap — `motion-reduce:transition-none` on every animated piece.
 *
 * `compact`: same purpose and same dimensions as `LanguageSwitcher`'s prop of the same name — the
 * marketing header now carries both controls with no more width than it used to give the language
 * switch alone, so both shrink together rather than one crowding the row at full size.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean } = {}) {
  const t = useTranslations("themeToggle");
  const { resolvedTheme, setTheme } = useTheme();
  // `resolvedTheme` is `undefined` on the server and on first client render — next-themes only
  // knows it after reading `localStorage`, which is client-only. Rendering the real switch against
  // that unresolved value would paint it in the light position for a dark-mode visitor (the
  // provider's blocking script has already put `.dark` on `<html>`, so the *page* is dark), then
  // visibly slide it across a frame later, on every single page load. So until `mounted`, render
  // a non-interactive twin whose position comes from the `dark:` variants instead — those key off
  // that same pre-paint class, so it is correct in both themes with no JS, and the real switch
  // takes over at the identical position without animating. Suppressing clicks over that window
  // falls out of this for free: there is no control to click yet.
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
      // Names the thing being toggled, not the action. Radix emits `role="switch"` plus
      // `aria-checked`, so an action-phrased name ("Switch to light mode") would be read out
      // alongside the state as "switch to light mode, switch, on" — announcing the opposite of
      // what is actually on.
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

/**
 * The pre-hydration stand-in described in `ThemeToggle`. Same box and same painted state as the
 * real switch, driven entirely by `dark:` variants rather than React state, so it is already
 * correct on the server render and the first client paint. `aria-hidden` because it is scenery:
 * it cannot be operated, so exposing it as a control would only offer assistive tech a dead
 * target for the frame or two before the real one arrives. No transitions anywhere — there is no
 * state change here to animate, and the real switch mounting into the same position must not look
 * like movement.
 */
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
