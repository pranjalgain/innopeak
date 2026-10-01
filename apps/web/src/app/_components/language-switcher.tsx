"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import { useLanguageSwitcher } from "@/hooks/common/use-language-switcher";

/**
 * Standalone, always-visible language toggle — same "always in chrome, never nested inside a
 * menu a user has to open first" reasoning the previous Light/Dark/System-style dropdown draft
 * had, and the same reason `ThemeToggle` exists as one. Rebuilt as a binary switch (this
 * codebase supports exactly two locales — `SUPPORTED_LOCALES` — so there is no third option a
 * toggle would have nowhere to put, unlike theme's dropped "System"), sharing `ThemeToggle`'s
 * exact sliding-thumb mechanics: the outgoing locale code shrinks/fades out while the incoming
 * one grows/fades in, so the swap reads as one continuous motion. `prefers-reduced-motion` still
 * gets a plain, instant swap via `motion-reduce:transition-none` on every animated piece.
 *
 * `checked` is driven by `useLanguageSwitcher`'s `locale` (itself `useLocale()`), not by local
 * state that flips optimistically — see that hook's own comment for why.
 *
 * `compact`: the marketing header (`SiteHeader`) has no width to spare — its own comment already
 * measured this row as fitting the *previous* icon-only trigger with only a few pixels left at
 * ~360px, and this switch's default size is wider than that trigger was. `compact` trims the
 * track/thumb down (48px vs 56px) to fit there instead of shrinking the switch everywhere,
 * which would make it feel like a different, smaller control on the pages that have room.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean } = {}) {
  const t = useTranslations("languageSwitcher");
  const { locale, isDisabled, selectLocale } = useLanguageSwitcher();
  const isGerman = locale === "de";

  return (
    <SwitchPrimitive.Root
      checked={isGerman}
      disabled={isDisabled}
      onCheckedChange={(checked) => selectLocale(checked ? "de" : "en")}
      // Names what the switch controls, not the action it would perform. Radix emits
      // `role="switch"` plus `aria-checked`, so "Switch to English" while German is active would
      // be announced as "switch to English, switch, on" — stating that English is on when it is
      // precisely what is off.
      aria-label={t("label")}
      className={cn(
        "focus-visible:ring-ring/50 relative inline-flex shrink-0 items-center rounded-full",
        compact ? "h-7 w-12" : "h-8 w-14",
        "border-border bg-accent border transition-colors duration-300 ease-fluid outline-none focus-visible:ring-[3px]",
        "motion-reduce:transition-none disabled:cursor-wait disabled:opacity-70",
      )}>
      <SwitchPrimitive.Thumb
        className={cn(
          "border-border bg-card shadow-elevated relative flex items-center justify-center rounded-full border",
          compact ? "size-5" : "size-6",
          "translate-x-1 transition-transform duration-300 ease-fluid",
          compact ? "data-[state=checked]:translate-x-6" : "data-[state=checked]:translate-x-7",
          "motion-reduce:transition-none",
        )}>
        <span
          aria-hidden="true"
          className={cn(
            "text-muted-foreground absolute text-[9px] font-semibold tracking-wide backface-hidden transition-all duration-300 ease-fluid",
            "motion-reduce:transition-none",
            isGerman ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
          )}>
          EN
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "text-muted-foreground absolute text-[9px] font-semibold tracking-wide backface-hidden transition-all duration-300 ease-fluid",
            "motion-reduce:transition-none",
            isGerman ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0",
          )}>
          DE
        </span>
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}
