import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AuthService } from "@/app/_libs/services/auth.service";
import { setLocaleCookie } from "@/app/_libs/utils/locale";
import { type AppLocale } from "@/i18n/locales";

interface UseLanguageSwitcherResult {
  locale: AppLocale;
  /** True while the sync call is in flight or `router.refresh()` is still applying the new locale. */
  isDisabled: boolean;
  selectLocale: (next: AppLocale) => void;
}

/** `locale` comes from `useLocale()`, not optimistic local state: if the sync call fails it returns before the cookie/locale change, so the controlled switch never moves. */
export function useLanguageSwitcher(): UseLanguageSwitcherResult {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const t = useTranslations("languageSwitcher");
  const [isSyncing, setIsSyncing] = useState(false);
  // `router.refresh()` is what moves `useLocale()`; as a transition it gives `isPending` for that stretch, so clearing
  // `isSyncing` alone would re-enable the control while it still shows the outgoing locale.
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
    // `startTransition` raises `isPending` before `isSyncing` drops, so `isDisabled` is never momentarily false; a `finally`
    // clearing `isSyncing` first would open that gap.
    startTransition(() => router.refresh());
    setIsSyncing(false);
  }

  return {
    locale,
    isDisabled: isSyncing || isPending,
    selectLocale: (next) => void selectLocale(next),
  };
}
