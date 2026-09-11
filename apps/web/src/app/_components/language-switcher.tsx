"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LuCheck, LuLanguages } from "react-icons/lu";
import { toast } from "sonner";

import { AuthService } from "@/app/_libs/services/auth.service";
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
  const t = useTranslations("languageSwitcher");

  /**
   * Waits for `AuthService.updateLocale` (a no-op for a signed-out visitor) before touching the
   * cookie or the UI — the two must not disagree, so a signed-in user's failed server sync keeps
   * the UI in its current language too, with a toast, rather than silently drifting: the chrome
   * would otherwise switch instantly while every backend-originated message (API errors, mutation
   * toasts, eventually emails) kept arriving in the old language until the user tried again.
   */
  async function selectLocale(next: AppLocale): Promise<void> {
    try {
      await AuthService.updateLocale(next);
    } catch {
      toast.error(t("syncFailed"));
      return;
    }

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
            onClick={() => void selectLocale(option)}
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
