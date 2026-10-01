import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AuthService } from "@/app/_libs/services/auth.service";
import { setLocaleCookie } from "@/app/_libs/utils/locale";
import { type AppLocale } from "@/i18n/locales";

interface UseLanguageSwitcherResult {
  locale: AppLocale;
  /** True while the sync call is in flight, or while `router.refresh()` is still applying the
   *  new locale — the switch should stay non-interactive for both. */
  isDisabled: boolean;
  selectLocale: (next: AppLocale) => void;
}

/**
 * Owns the locale-switch side effect `LanguageSwitcher` triggers: sync to the backend, set the
 * cookie, then refresh so `useLocale()` (and therefore the switch's own `checked` state) actually
 * moves.
 *
 * `locale` is driven by `useLocale()`, not local state that flips optimistically — the sync call
 * (`AuthService.updateLocale`) can fail, and on failure this returns before the cookie/locale
 * actually change. Because the underlying `locale` value never moved, a controlled switch reading
 * it simply never animates in the first place, the same "don't move until it's real" guarantee a
 * `syncFailed` toast plus no-op already gives.
 */
export function useLanguageSwitcher(): UseLanguageSwitcherResult {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const t = useTranslations("languageSwitcher");
  const [isSyncing, setIsSyncing] = useState(false);
  // `router.refresh()` is what actually moves `useLocale()`, and therefore the switch. Marking it
  // as a transition gives us `isPending` for exactly that stretch, which `isDisabled` needs:
  // clearing `isSyncing` on its own would re-enable the control while it still displays the
  // outgoing locale, and a click in that gap re-sends the locale already in flight instead of
  // reversing it.
  const [isPending, startTransition] = useTransition();

  async function selectLocale(next: AppLocale): Promise<void> {
    setIsSyncing(true);
    try {
      await AuthService.updateLocale(next);
    } catch {
      setIsSyncing(false);
      toast.error(t("syncFailed"));
      return;
    }

    setLocaleCookie(next);
    // Ordered so the control is never momentarily enabled: `startTransition` raises `isPending`
    // before `isSyncing` drops, and the two are read together by `isDisabled`. A `finally` clearing
    // `isSyncing` ahead of this would leave that gap open to whatever React chose to batch.
    startTransition(() => router.refresh());
    setIsSyncing(false);
  }

  return {
    locale,
    isDisabled: isSyncing || isPending,
    selectLocale: (next) => void selectLocale(next),
  };
}
