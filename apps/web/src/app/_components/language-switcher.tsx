"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import { useLanguageSwitcher } from "@/hooks/common/use-language-switcher";

/**
 * Always-visible binary switch (exactly two `SUPPORTED_LOCALES`) sharing `ThemeToggle`'s sliding-thumb mechanics. `checked`
 * comes from `useLanguageSwitcher`'s `locale`, not optimistic local state (see that hook). `compact` (48px vs 56px track)
 * fits the marketing header, which has only a few pixels to spare at ~360px, without shrinking the switch everywhere.
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
      // Names what the switch controls, not the action: Radix emits `role="switch"` + `aria-checked`, so "Switch to English"
      // while German is active would announce English as on.
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
