"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { LuCheck, LuLanguages } from "react-icons/lu";

import { setLocaleCookie } from "@/app/_libs/utils/locale";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type AppLocale, LOCALE_LABELS, SUPPORTED_LOCALES } from "@/i18n/locales";

/**
 * Standalone, always-visible language toggle — one control, present in every chrome
 * surface (the public marketing header, the pre-auth login/signup corner, and the
 * dashboard/admin top bar) rather than nested inside an account dropdown a signed-in
 * user has to open first to discover it. Writes the `NEXT_LOCALE` cookie
 * `src/i18n/request.ts` reads, then `router.refresh()` so the current page's Server
 * Components re-render against it — no full reload, since `refresh()` re-fetches the
 * RSC tree for the current URL and therefore re-runs `request.ts` on that same round
 * trip.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  function selectLocale(next: AppLocale): void {
    setLocaleCookie(next);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={LOCALE_LABELS[locale as AppLocale]}>
          <LuLanguages aria-hidden="true" />
          {/* Icon-only below `sm` — the site header's fixed row of controls (logo, this,
              sign-in, the CTA) has no slack left for both an icon and a locale code once
              German's longer button labels are in play; see the German-vs-English
              responsiveness check in the design doc's Verification section. The dropdown
              itself still spells out each language in full once opened. */}
          <span className="hidden sm:inline">{(locale as AppLocale).toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map(option => (
          <DropdownMenuItem
            key={option}
            onClick={() => selectLocale(option)}
            className="cursor-pointer justify-between"
          >
            {LOCALE_LABELS[option]}
            {option === locale ? <LuCheck aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
